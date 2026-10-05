// Pure transforms: Weaviate rows -> public catalog records.
// No I/O here, so every public filter can be tested offline with fixtures.
//
// Scope: Reboot Democracy and InnovateUS content only. Every record's url
// must be on an allowed host (catalog.config.json -> allowed_hosts).
// Never exported: full text, transcripts, instructor bios and headshots,
// Zoom recording links, workshops flagged notOpenToPublic, unpublished
// posts and courses, and the third-party articles linked from the weekly
// news digests.

// Metadata fields requested per collection. Anything not listed is never read.
export const FIELDS = {
  RebootBlogPostChunk: ['directusId', 'slug', 'title', 'date', 'authors', 'tags', 'status', 'fullUrl'],
  RebootWeeklyNewsItem: ['edition', 'title', 'date'],
  InnovateUSWorkshop: ['directusId', 'slug', 'title', 'date', 'language', 'youtubeVideoId', 'seriesTitle', 'instructorNames', 'category', 'notOpenToPublic'],
  InnovateUSCourse: ['directusId', 'slug', 'title', 'language', 'status', 'courseLive'],
};
// Workshop_transcripts is read as one aggregate per video (no chunk rows).
export const TRANSCRIPT_GROUP_FIELDS = { text: ['title', 'url', 'date'], number: ['end_seconds'], integer: ['directus_id'] };

export const PROGRAMS = ['Reboot Democracy', 'InnovateUS'];
export const DEFAULT_ALLOWED_HOSTS = ['rebootdemocracy.ai', 'innovate-us.org', 'youtube.com'];

export const TYPE_LABELS = {
  'blog-post': 'Blog posts',
  'news-digest': 'Weekly news digests',
  workshop: 'Workshops',
  'workshop-video': 'Workshop recordings',
  course: 'Courses',
};

// Never publish these, whatever collection they come from.
export const URL_DENYLIST = [
  /zoom\.us\/rec\//i, // Zoom cloud-recording share links
  /\/login(\/|\.php|$|\?)/i, // login pages
  /^https?:\/\/(localhost|127\.|10\.|192\.168\.)/i,
  /[?&](access_token|token|pwd|passcode)=/i,
];
const TRACKING_PARAM = /^(utm_.*|e|fbclid|gclid|mc_cid|mc_eid)$/i;

const blank = (v) => v === undefined || v === null || v === '';
const arr = (v) => (Array.isArray(v) ? v : blank(v) ? [] : [v]).filter((x) => !blank(x)).map((x) => String(x).trim()).filter(Boolean);
const uniq = (xs) => [...new Set(xs)];
const first = (rows, f) => rows.map(f).find((v) => !blank(v));

export function isoDate(v) {
  if (blank(v)) return null;
  const s = v instanceof Date ? v.toISOString() : String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Free-form dates ("May 1, 2024") parse to local midnight: read local parts.
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Cleans a URL for publication: drops tracking params; null when unusable. */
export function cleanUrl(raw) {
  if (blank(raw)) return null;
  const s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u.toString();
}

/** Key used to merge duplicates: scheme, www. and trailing slash ignored. */
export function urlKey(url) {
  const u = new URL(url);
  return `${hostOf(url)}${u.pathname.replace(/\/+$/, '')}${u.search}`;
}

export const hostOf = (url) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');
export const isDenied = (url) => URL_DENYLIST.some((re) => re.test(url));
/** Exact host match after dropping "www." — subdomains (e.g. course.innovate-us.org) are not allowed. */
export const isAllowedHost = (url, hosts = DEFAULT_ALLOWED_HOSTS) => {
  try { return hosts.includes(hostOf(url)); } catch { return false; }
};

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows ?? []) {
    const k = keyFn(r);
    if (blank(k)) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/* ── per-collection builders ─────────────────────────────── */

function rebootBlog(rows, drop) {
  const out = [];
  for (const [id, g] of groupBy(rows, (r) => r.directusId ?? r.slug)) {
    const statuses = uniq(g.map((r) => r.status).filter((s) => !blank(s)));
    if (statuses.length && !statuses.includes('published')) { drop('unpublished blog post'); continue; }
    const slug = first(g, (r) => r.slug);
    out.push({
      id: `reboot-blog-${id}`,
      program: 'Reboot Democracy',
      type: 'blog-post',
      title: first(g, (r) => r.title),
      date: isoDate(first(g, (r) => r.date)),
      url: first(g, (r) => r.fullUrl) || (slug ? `https://rebootdemocracy.ai/blog/${slug}` : null),
      authors: uniq(g.flatMap((r) => arr(r.authors))),
      topics: uniq(g.flatMap((r) => arr(r.tags))),
    });
  }
  return out;
}

// One record per weekly edition; the digest page lives at /newsthatcaughtoureye/<edition>.
function rebootDigests(rows) {
  const out = [];
  for (const [ed, g] of groupBy(rows, (r) => String(r.edition ?? '').trim())) {
    if (!/^\d+$/.test(ed)) continue;
    out.push({
      id: `reboot-news-${ed}`,
      program: 'Reboot Democracy',
      type: 'news-digest',
      title: first(g, (r) => r.title),
      date: isoDate(first(g, (r) => r.date)),
      url: `https://rebootdemocracy.ai/newsthatcaughtoureye/${ed}`,
    });
  }
  return out;
}

function innovateUS(workshops, transcripts, drop) {
  const videos = new Map();
  for (const r of transcripts ?? []) {
    if (blank(r.video_id)) continue;
    const v = videos.get(r.video_id) ?? { video_id: r.video_id, seconds: 0 };
    v.seconds = Math.max(v.seconds, Number(r.end_seconds) || 0);
    v.directus_id ??= blank(r.directus_id) ? undefined : Number(r.directus_id);
    v.title ||= r.title;
    v.date ||= r.date;
    v.url ||= r.url;
    videos.set(r.video_id, v);
  }
  const byDirectus = new Map([...videos.values()].filter((v) => v.directus_id !== undefined).map((v) => [v.directus_id, v]));
  const used = new Set();
  const out = [];
  for (const [id, g] of groupBy(workshops, (r) => r.directusId)) {
    if (g.some((r) => r.notOpenToPublic === true)) {
      drop('workshop not open to the public');
      // its recording stays out too, however it is matched
      for (const r of g) if (!blank(r.youtubeVideoId)) used.add(r.youtubeVideoId);
      const v = byDirectus.get(Number(id));
      if (v) used.add(v.video_id);
      continue;
    }
    const en = g.find((r) => r.language === 'en-US') ?? g[0];
    const slug = en.slug || first(g, (r) => r.slug);
    if (!slug) { drop('workshop without slug'); continue; }
    const yt = en.youtubeVideoId || first(g, (r) => r.youtubeVideoId);
    const v = (yt && videos.get(yt)) || byDirectus.get(Number(id));
    if (v) used.add(v.video_id);
    out.push({
      id: `innovateus-workshop-${id}`,
      program: 'InnovateUS',
      type: 'workshop',
      title: en.title || first(g, (r) => r.title),
      date: isoDate(en.date || first(g, (r) => r.date)),
      url: `https://innovate-us.org/${slug}`,
      authors: arr(en.instructorNames),
      series: blank(en.seriesTitle) ? null : en.seriesTitle,
      topics: arr(en.category),
      languages: uniq(g.map((r) => r.language).filter((l) => !blank(l))).sort(),
      video_url: yt ? `https://www.youtube.com/watch?v=${yt}` : v?.url || null,
      duration_min: v?.seconds ? Math.round(v.seconds / 60) : null,
    });
  }
  // Recordings whose workshop is not in the workshop index.
  for (const v of videos.values()) {
    if (used.has(v.video_id)) continue;
    out.push({
      id: `innovateus-video-${v.video_id}`,
      program: 'InnovateUS',
      type: 'workshop-video',
      title: v.title,
      date: isoDate(v.date),
      url: v.url || `https://www.youtube.com/watch?v=${v.video_id}`,
      duration_min: v.seconds ? Math.round(v.seconds / 60) : null,
    });
  }
  return out;
}

function innovateUSCourses(rows, drop) {
  const out = [];
  for (const [id, g] of groupBy(rows, (r) => r.directusId)) {
    const live = g.filter((r) => r.status === 'published' || r.status === 'true' || r.courseLive === true);
    if (!live.length) { drop('unpublished course'); continue; }
    const en = live.find((r) => r.language === 'en-US') ?? live[0];
    if (blank(en.slug)) { drop('course without slug'); continue; }
    out.push({
      id: `innovateus-course-${id}`,
      program: 'InnovateUS',
      type: 'course',
      title: en.title,
      date: null,
      url: `https://innovate-us.org/course/${en.slug}`,
      languages: uniq(live.map((r) => r.language).filter((l) => !blank(l))).sort(),
    });
  }
  return out;
}

/* ── assembly ────────────────────────────────────────────── */

const ORDER = (r) => [PROGRAMS.indexOf(r.program), Object.keys(TYPE_LABELS).indexOf(r.type), r.date ? -Date.parse(r.date) : Infinity, r.id];
function compare(a, b) {
  const x = ORDER(a), y = ORDER(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/**
 * raw: { RebootBlogPostChunk, RebootWeeklyNewsItem, InnovateUSWorkshop, InnovateUSCourse, Workshop_transcripts }
 * -> { records, dropped }. Records come out sorted and deduplicated by URL.
 */
export function buildCatalog(raw, { allowedHosts = DEFAULT_ALLOWED_HOSTS } = {}) {
  const dropped = {};
  const drop = (reason) => { dropped[reason] = (dropped[reason] ?? 0) + 1; };
  const candidates = [
    ...rebootBlog(raw.RebootBlogPostChunk, drop),
    ...rebootDigests(raw.RebootWeeklyNewsItem),
    ...innovateUS(raw.InnovateUSWorkshop, raw.Workshop_transcripts, drop),
    ...innovateUSCourses(raw.InnovateUSCourse, drop),
  ];
  const seen = new Map();
  for (const rec of candidates) {
    const url = cleanUrl(rec.url);
    if (!url) { drop('no usable URL'); continue; }
    if (isDenied(url)) { drop('denylisted URL'); continue; }
    if (!isAllowedHost(url, allowedHosts)) { drop('URL outside allowed hosts'); continue; }
    if (blank(rec.title)) { drop('no title'); continue; }
    const key = urlKey(url);
    if (seen.has(key)) { drop('duplicate URL'); continue; }
    const out = { ...rec, title: String(rec.title).replace(/\s+/g, ' ').trim(), url };
    if (out.video_url) {
      const v = cleanUrl(out.video_url);
      out.video_url = v && !isDenied(v) && isAllowedHost(v, allowedHosts) ? v : null;
    }
    seen.set(key, Object.fromEntries(Object.entries(out).filter(([, v]) => !blank(v) && !(Array.isArray(v) && v.length === 0))));
  }
  return { records: [...seen.values()].sort(compare), dropped };
}
