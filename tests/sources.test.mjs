// Offline tests for the public filters (synthetic fixtures, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, TRANSCRIPT_GROUP_FIELDS, buildCatalog, cleanUrl, isAllowedHost, isoDate } from '../scripts/lib/sources.mjs';

const raw = {
  RebootBlogPostChunk: [
    { directusId: 1, slug: 'post-one', title: 'Post one', date: '2026-01-02T12:00:00Z', authors: ['A. Author'], tags: ['AI Tools'], status: 'published' },
    { directusId: 1, slug: 'post-one', title: 'Post one', fullUrl: 'https://rebootdemocracy.ai/blog/post-one' },
    { directusId: 2, slug: 'draft-post', title: 'Draft', status: 'draft' },
    { directusId: 3, slug: 'legacy-post', title: 'Legacy post' },
    { directusId: 4, slug: 'x', title: 'Points elsewhere', status: 'published', fullUrl: 'https://mailchi.mp/abc/def?e=123' },
  ],
  RebootWeeklyNewsItem: [
    { edition: '87', title: 'Edition 87', date: '2025-05-01T09:00:00Z' },
    { edition: '87', title: 'Edition 87' },
    { edition: 'draft', title: 'Not an edition' },
  ],
  InnovateUSWorkshop: [
    { directusId: 10, slug: 'open-ws', title: 'Open workshop', date: '2025-03-04T19:00:00Z', language: 'en-US', youtubeVideoId: 'yt10', instructorNames: ['I. Structor'], category: 'Evaluation', seriesTitle: 'AI series' },
    { directusId: 10, slug: 'open-ws', title: 'Atelier ouvert', language: 'fr-FR' },
    { directusId: 11, slug: 'closed-ws', title: 'Closed workshop', language: 'en-US', notOpenToPublic: true, youtubeVideoId: 'yt11' },
  ],
  Workshop_transcripts: [
    { video_id: 'yt10', directus_id: 10, title: 'Open workshop', url: 'https://www.youtube.com/watch?v=yt10', end_seconds: 3600 },
    { video_id: 'yt11', directus_id: 11, title: 'Closed workshop', url: 'https://www.youtube.com/watch?v=yt11', end_seconds: 3000 },
    { video_id: 'ytX', title: 'Older recording', date: '2024-02-03', url: 'https://www.youtube.com/watch?v=ytX', end_seconds: 600 },
  ],
  InnovateUSCourse: [
    { directusId: 20, slug: 'live-course', title: 'Live course', language: 'en-US', status: 'published' },
    { directusId: 20, slug: 'live-course', title: 'Curso', language: 'es-ES', status: 'published' },
    { directusId: 21, slug: 'draft-course', title: 'Draft course', language: 'en-US', status: 'draft' },
  ],
};

const { records, dropped } = buildCatalog(raw);
const byUrl = Object.fromEntries(records.map((r) => [r.url, r]));
const links = records.flatMap((r) => [r.url, r.video_url].filter(Boolean));

test('reads only metadata from Reboot and InnovateUS collections', () => {
  assert.deepEqual(Object.keys(FIELDS).sort(), ['InnovateUSCourse', 'InnovateUSWorkshop', 'RebootBlogPostChunk', 'RebootWeeklyNewsItem']);
  const requested = [...Object.values(FIELDS).flat(), ...Object.values(TRANSCRIPT_GROUP_FIELDS).flat()];
  for (const f of ['recordingLink', 'instructorBios', 'instructorHeadshotIds', 'moderatorBios', 'content', 'contentPlain', 'text', 'summary', 'itemUrl', 'searchText', 'description']) {
    assert.ok(!requested.includes(f), `${f} must not be requested`);
  }
});

test('every link points to rebootdemocracy.ai, innovate-us.org or an InnovateUS recording', () => {
  assert.ok(links.length > 0);
  for (const u of links) assert.ok(isAllowedHost(u), u);
  assert.ok(!links.some((u) => /zoom\.us|mailchi\.mp/.test(u)));
  assert.equal(dropped['URL outside allowed hosts'], 1);
});

test('only public workshops, recordings and courses', () => {
  assert.ok(!links.some((u) => /closed-ws|yt11|draft-course/.test(u)));
  const ws = byUrl['https://innovate-us.org/open-ws'];
  assert.equal(ws.title, 'Open workshop');
  assert.equal(ws.video_url, 'https://www.youtube.com/watch?v=yt10');
  assert.equal(ws.duration_min, 60);
  assert.equal(ws.series, 'AI series');
  assert.deepEqual(ws.languages, ['en-US', 'fr-FR']);
  assert.deepEqual(byUrl['https://innovate-us.org/course/live-course'].languages, ['en-US', 'es-ES']);
});

test('recordings without a workshop entry are listed on their own', () => {
  const v = byUrl['https://www.youtube.com/watch?v=ytX'];
  assert.equal(v.type, 'workshop-video');
  assert.equal(v.duration_min, 10);
  assert.equal(records.filter((r) => r.type === 'workshop-video').length, 1);
});

test('blog posts: published or legacy, never drafts', () => {
  assert.equal(byUrl['https://rebootdemocracy.ai/blog/post-one'].date, '2026-01-02');
  assert.ok(byUrl['https://rebootdemocracy.ai/blog/legacy-post']);
  assert.ok(!links.some((u) => u.includes('draft-post')));
});

test('one digest per numbered edition', () => {
  const ed = byUrl['https://rebootdemocracy.ai/newsthatcaughtoureye/87'];
  assert.equal(ed.type, 'news-digest');
  assert.equal(ed.date, '2025-05-01');
  assert.equal(records.filter((r) => r.type === 'news-digest').length, 1);
});

test('helpers', () => {
  assert.equal(cleanUrl('https://rebootdemocracy.ai/blog/a?utm_source=x&e=1'), 'https://rebootdemocracy.ai/blog/a');
  assert.equal(cleanUrl('not a url'), null);
  assert.ok(isAllowedHost('https://www.innovate-us.org/x'));
  assert.ok(!isAllowedHost('https://course.innovate-us.org/login/index.php'));
  assert.ok(!isAllowedHost('https://evil-rebootdemocracy.ai/x'));
  assert.equal(isoDate('May 1, 2024'), '2024-05-01');
  assert.equal(isoDate(''), null);
});

test('deterministic order and output', () => {
  assert.deepEqual(buildCatalog(raw).records, records);
  assert.deepEqual(records.map((r) => r.type), ['blog-post', 'blog-post', 'news-digest', 'workshop', 'workshop-video', 'course']);
});
