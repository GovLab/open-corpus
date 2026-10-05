#!/usr/bin/env node
// Read-only export: Weaviate -> data/sources.json.
//
// Requests only the metadata fields listed in lib/sources.mjs (FIELDS), plus
// one aggregate per workshop recording (title, url, date, length) — never
// full text, transcripts, bios, headshots or Zoom recording links. The public
// filters (published only, not notOpenToPublic, allowed hosts, URL denylist,
// dedupe) are applied in lib/sources.mjs before anything is written.
//
// ENV: WEAVIATE_URL + WEAVIATE_API_KEY (a read-only key is enough).
//      The rebootdemocracy names also work: VITE_WEAVIATE_HOST,
//      VITE_WEAVIATE_HTTP_SCHEME, VITE_WEAVIATE_APIKEY.
// Usage: node scripts/export-urls.mjs          (then: node scripts/build-readme.mjs)

import fs from 'node:fs';
import weaviate from 'weaviate-client';
import { FIELDS, TRANSCRIPT_GROUP_FIELDS, buildCatalog } from './lib/sources.mjs';

const OUT = new URL('../data/sources.json', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('../catalog.config.json', import.meta.url), 'utf8'));

function endpoint() {
  const raw = (process.env.WEAVIATE_URL || process.env.VITE_WEAVIATE_HOST || '').trim();
  if (!raw) throw new Error('Set WEAVIATE_URL (or VITE_WEAVIATE_HOST)');
  return /^https?:\/\//i.test(raw) ? raw : `${process.env.VITE_WEAVIATE_HTTP_SCHEME || 'https'}://${raw}`;
}
const apiKey = process.env.WEAVIATE_API_KEY || process.env.VITE_WEAVIATE_APIKEY;
if (!apiKey) throw new Error('Set WEAVIATE_API_KEY (or VITE_WEAVIATE_APIKEY)');

const client = await weaviate.connectToWeaviateCloud(endpoint(), {
  authCredentials: new weaviate.ApiKey(apiKey),
  timeout: { query: 60_000, init: 20_000 },
});

async function retry(fn, tries = 5) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

// Cursor through a collection, metadata fields only.
async function fetchAll(name) {
  const col = client.collections.get(name);
  const rows = [];
  let after;
  for (;;) {
    const res = await retry(() => col.query.fetchObjects({ limit: 1000, after, returnProperties: FIELDS[name] }));
    for (const o of res.objects) rows.push(o.properties);
    if (res.objects.length < 1000) break;
    after = res.objects.at(-1).uuid;
  }
  return rows;
}

// One aggregate row per recording instead of reading ~170k transcript chunks.
async function transcriptVideos() {
  const col = client.collections.get('Workshop_transcripts');
  const m = col.metrics;
  const groups = await retry(() => col.aggregate.groupBy.overAll({
    groupBy: { property: 'video_id', limit: 100_000 },
    returnMetrics: [
      ...TRANSCRIPT_GROUP_FIELDS.text.map((p) => m.aggregate(p).text(['topOccurrencesValue'], 1)),
      ...TRANSCRIPT_GROUP_FIELDS.number.map((p) => m.aggregate(p).number(['maximum'])),
      ...TRANSCRIPT_GROUP_FIELDS.integer.map((p) => m.aggregate(p).integer(['maximum'])),
    ],
  }));
  const top = (p) => p?.topOccurrences?.[0]?.value ?? null;
  return groups.map((g) => ({
    video_id: g.groupedBy.value,
    title: top(g.properties.title),
    url: top(g.properties.url),
    date: top(g.properties.date),
    end_seconds: g.properties.end_seconds?.maximum ?? 0,
    directus_id: g.properties.directus_id?.maximum ?? null,
  }));
}

const raw = {};
try {
  for (const name of Object.keys(FIELDS)) {
    raw[name] = await fetchAll(name);
    console.log(`${name.padEnd(28)} ${String(raw[name].length).padStart(7)} objects`);
  }
  raw.Workshop_transcripts = await transcriptVideos();
  console.log(`${'Workshop_transcripts'.padEnd(28)} ${String(raw.Workshop_transcripts.length).padStart(7)} recordings`);
} finally {
  await client.close();
}

const { records, dropped } = buildCatalog(raw, { allowedHosts: config.allowed_hosts });
// One record per line keeps git diffs readable; no timestamp, so an unchanged
// catalog produces an unchanged file (and no commit).
fs.mkdirSync(new URL('.', OUT), { recursive: true });
fs.writeFileSync(OUT, `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);

const counts = {};
for (const r of records) counts[`${r.program} / ${r.type}`] = (counts[`${r.program} / ${r.type}`] ?? 0) + 1;
console.log(`\n${records.length} records -> data/sources.json`);
for (const [k, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('Left out:');
for (const [k, n] of Object.entries(dropped)) console.log(`  ${String(n).padStart(6)}  ${k}`);
