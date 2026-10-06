#!/usr/bin/env node
// Drops catalog entries whose page is gone, then rewrites data/sources.json.
//
// The sites answer unknown slugs with HTTP 200 and a generic title (a "soft
// 404"), so every page link is fetched — only up to its </title> — and must
// return 200 with a real title (catalog.config.json -> not_found_titles lists
// the generic ones). Recording links are checked through YouTube oEmbed; a dead
// recording is removed from its workshop entry, the workshop stays.
// If more than 10% of pages fail at once (an outage, not a dead page), nothing
// is written and the script exits 1.
//
// Usage: node scripts/check-links.mjs        (after export-urls, before build-readme)

import fs from 'node:fs';
import { blurb } from './lib/sources.mjs';

const root = (p) => new URL(`../${p}`, import.meta.url);
const config = JSON.parse(fs.readFileSync(root('catalog.config.json'), 'utf8'));
const NOT_FOUND = new Set(config.not_found_titles ?? []);
const MAX_BROKEN_SHARE = 0.1;
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (compatible; open-corpus-link-check; +https://github.com/GovLab/open-corpus)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'ok' | 'gone' — pure, so it can be tested offline. */
export function classify({ status, title }, notFound = NOT_FOUND) {
  if (status !== 200) return 'gone';
  if (!title || notFound.has(title)) return 'gone';
  return 'ok';
}

async function fetchTitle(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ctrl.signal });
    if (res.status !== 200) { await res.body?.cancel(); return { status: res.status }; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let html = '';
    while (html.length < 65_536 && !/<\/title>/i.test(html)) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
    }
    await reader.cancel();
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return { status: 200, title: m ? blurb(m[1], 1000) : null };
  } finally {
    clearTimeout(timer);
  }
}

// Retries network errors, 429/5xx and soft-404 titles (an SSR hiccup can
// render the generic page once); a hard 404/410 is final.
async function checkPage(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      last = await fetchTitle(url);
      if (classify(last) === 'ok' || last.status === 404 || last.status === 410) return last;
    } catch (e) {
      last = { status: 0, error: String(e.message ?? e) };
    }
    await sleep(1500 * attempt);
  }
  return last;
}

async function checkVideo(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { headers: { 'User-Agent': UA } });
      await res.body?.cancel();
      if (res.status === 200) return true;
      if (res.status < 500 && res.status !== 429) return false;
    } catch { /* retry */ }
    await sleep(1500 * attempt);
  }
  return false;
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const records = JSON.parse(fs.readFileSync(root('data/sources.json'), 'utf8'));
  const pages = await pool(records, (r) => checkPage(r.url));
  const gone = records.filter((r, i) => classify(pages[i]) === 'gone');
  console.log(`pages: ${records.length - gone.length} ok, ${gone.length} gone`);
  for (const [i, r] of records.entries()) {
    if (classify(pages[i]) === 'gone') console.log(`  gone  ${r.url}  (${pages[i].status}${pages[i].title ? ` "${pages[i].title}"` : ''}${pages[i].error ? ` ${pages[i].error}` : ''})`);
  }
  if (gone.length > records.length * MAX_BROKEN_SHARE) {
    console.error(`More than ${MAX_BROKEN_SHARE * 100}% of pages failed; looks like an outage. Nothing written.`);
    process.exit(1);
  }

  const withVideo = records.filter((r) => r.video_url && !gone.includes(r));
  const videoOk = await pool(withVideo, (r) => checkVideo(r.video_url));
  const deadVideos = withVideo.filter((r, i) => !videoOk[i]);
  console.log(`recordings: ${withVideo.length - deadVideos.length} ok, ${deadVideos.length} unavailable`);
  for (const r of deadVideos) console.log(`  unavailable  ${r.video_url}  (${r.url})`);
  if (deadVideos.length > withVideo.length * MAX_BROKEN_SHARE) {
    console.error(`More than ${MAX_BROKEN_SHARE * 100}% of recordings failed; looks like an outage. Nothing written.`);
    process.exit(1);
  }

  const kept = records.filter((r) => !gone.includes(r)).map((r) => {
    if (!deadVideos.includes(r)) return r;
    const { video_url, duration_min, ...rest } = r;
    return rest;
  });
  fs.writeFileSync(root('data/sources.json'), `[\n${kept.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
  console.log(`${kept.length} entries kept -> data/sources.json`);
}
