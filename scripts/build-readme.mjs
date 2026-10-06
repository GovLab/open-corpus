#!/usr/bin/env node
// data/sources.json -> README.md, lists/*.md, data/sources.csv, llms.txt.
// Deterministic for a given day (future-dated workshops join "Latest additions"
// once their date has passed), so an unchanged catalog produces no commit.
// Exits non-zero if any link is denylisted (e.g. a Zoom recording) or points
// outside the allowed hosts in catalog.config.json.

import fs from 'node:fs';
import { DEFAULT_ALLOWED_HOSTS, PROGRAMS, TYPE_LABELS, isAllowedHost, isDenied } from './lib/sources.mjs';

const root = (p) => new URL(`../${p}`, import.meta.url);
const config = JSON.parse(fs.readFileSync(root('catalog.config.json'), 'utf8'));
const all = JSON.parse(fs.readFileSync(root('data/sources.json'), 'utf8'));
const hosts = config.allowed_hosts ?? DEFAULT_ALLOWED_HOSTS;

const bad = all.filter((r) => [r.url, r.video_url].filter(Boolean).some((u) => isDenied(u) || !isAllowedHost(u, hosts)));
if (bad.length) {
  console.error(`Refusing to build: ${bad.length} record(s) link outside ${hosts.join(', ')} or to a denylisted URL, e.g. ${bad[0].id}`);
  process.exit(1);
}

const include = config.programs ?? PROGRAMS;
const records = all.filter((r) => include.includes(r.program));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const label = (t) => TYPE_LABELS[t] ?? t;
const md = (s) => String(s).replace(/\s+/g, ' ').replace(/([\\[\]])/g, '\\$1').trim();
const month = (d) => (d ? d.slice(0, 7) : null);
const entries = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'entry' : 'entries'}`;
const span = (g) => (g.from ? (g.from === g.to ? g.from : `${g.from} – ${g.to}`) : '');

// group by program + type, in config order
const groups = [];
for (const program of include) {
  const types = [...new Set(records.filter((r) => r.program === program).map((r) => r.type))]
    .sort((a, b) => Object.keys(TYPE_LABELS).indexOf(a) - Object.keys(TYPE_LABELS).indexOf(b));
  for (const type of types) {
    const items = records.filter((r) => r.program === program && r.type === type);
    const dates = items.map((r) => r.date).filter(Boolean).sort();
    groups.push({ program, type, items, file: `lists/${slug(program)}--${type}.md`, from: month(dates[0]), to: month(dates.at(-1)) });
  }
}

function line(r) {
  const bits = [r.date ?? 'undated', `[${md(r.title)}](${r.url})`];
  if (r.authors?.length) bits.push(md(r.authors.slice(0, 4).join(', ') + (r.authors.length > 4 ? ' et al.' : '')));
  if (r.series) bits.push(md(r.series));
  if (r.video_url && r.video_url !== r.url) bits.push(`[recording](${r.video_url})`);
  if (r.duration_min) bits.push(`${r.duration_min} min`);
  // two trailing spaces = hard line break, so the blurb sits under its link
  return r.summary ? `- ${bits.join(' · ')}  \n  ${md(r.summary)}` : `- ${bits.join(' · ')}`;
}

// lists/*.md (regenerated from scratch so removed groups disappear)
fs.rmSync(root('lists'), { recursive: true, force: true });
fs.mkdirSync(root('lists'));
for (const g of groups) {
  fs.writeFileSync(root(g.file), [
    `# ${g.program} — ${label(g.type)}`,
    '',
    `${entries(g.items.length)}${g.from ? ` · ${span(g)}` : ''}. Newest first. Back to the [catalog](../README.md).`,
    '',
    ...g.items.map(line),
    '',
  ].join('\n'));
}

// data/sources.csv
const COLS = ['id', 'program', 'type', 'title', 'date', 'url', 'summary', 'authors', 'topics', 'series', 'languages', 'video_url', 'duration_min'];
const cell = (v) => {
  const s = Array.isArray(v) ? v.join('; ') : v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
fs.writeFileSync(root('data/sources.csv'), [COLS.join(','), ...records.map((r) => COLS.map((c) => cell(r[c])).join(','))].join('\n') + '\n');

// README.md
const today = new Date().toISOString().slice(0, 10);
const newest = records.filter((r) => r.date && r.date <= today)
  .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : a.id < b.id ? -1 : 1))
  .slice(0, config.latest_count ?? 15);

fs.writeFileSync(root('README.md'), [
  `# ${config.title}`,
  '',
  config.intro,
  '',
  `**${records.length.toLocaleString('en-US')} entries** · machine-readable: [data/sources.json](data/sources.json), [data/sources.csv](data/sources.csv), [llms.txt](llms.txt)`,
  '',
  '## What is inside',
  '',
  '| Program | Type | Entries | Dates | List |',
  '|---|---|---:|---|---|',
  ...groups.map((g) => `| ${g.program} | ${label(g.type)} | ${g.items.length.toLocaleString('en-US')} | ${span(g)} | [open](${g.file}) |`),
  '',
  '## Latest additions',
  '',
  ...newest.map((r) => `- ${r.date} · ${r.program} · [${md(r.title)}](${r.url})`),
  '',
  '## Record fields',
  '',
  'Every entry in `data/sources.json` has `id`, `program`, `type`, `title` and `url`, and where known `date`, `summary` (the teaser shown on the page itself), `authors`, `topics`, `series`, `languages`, `video_url` (the workshop recording) and `duration_min`.',
  '',
  '## About this catalog',
  '',
  config.about,
  '',
].join('\n'));

// llms.txt (https://llmstxt.org)
fs.writeFileSync(root('llms.txt'), [
  `# ${config.title}`,
  '',
  `> ${config.intro}`,
  '',
  `Full catalog: data/sources.json (${entries(records.length)}, one per line) and data/sources.csv. Cite each entry's \`url\`.`,
  '',
  '## Lists',
  '',
  ...groups.map((g) => `- [${g.program} — ${label(g.type)}](${g.file}): ${entries(g.items.length)}${g.from ? `, ${span(g)}` : ''}`),
  '',
].join('\n'));

console.log(`README.md, llms.txt, data/sources.csv and ${groups.length} lists written for ${entries(records.length)}`);
for (const g of groups) console.log(`  ${String(g.items.length).padStart(6)}  ${g.program} — ${label(g.type)}`);
