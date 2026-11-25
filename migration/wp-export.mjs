#!/usr/bin/env node
// Exports the current WordPress site through its public REST API.
// Usage: node migration/wp-export.mjs [--media]
// Output: migration/export/*.json (+ migration/export/media/ with --media)

import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const SITE = "https://miraflorescostatropical.com";
const OUT = path.join(import.meta.dirname, "export");
const withMedia = process.argv.includes("--media");

async function fetchAll(type) {
  const items = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${SITE}/wp-json/wp/v2/${type}?per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`${type} page ${page}: HTTP ${res.status}`);
    items.push(...(await res.json()));
    if (page >= Number(res.headers.get("x-wp-totalpages") ?? 1)) break;
  }
  return items;
}

await mkdir(OUT, { recursive: true });

for (const type of ["pages", "posts", "media", "categories", "tags"]) {
  const items = await fetchAll(type);
  await writeFile(path.join(OUT, `${type}.json`), JSON.stringify(items, null, 2));
  console.log(`${type}: ${items.length}`);
}

// Old URL -> SEO title/description, used to build redirects and keep metadata.
const seo = [...(await fetchAll("pages")), ...(await fetchAll("posts"))].map((p) => ({
  url: p.link,
  title: p.yoast_head_json?.title ?? p.title.rendered,
  description: p.yoast_head_json?.description ?? null,
}));
await writeFile(path.join(OUT, "seo.json"), JSON.stringify(seo, null, 2));

if (withMedia) {
  const media = await fetchAll("media");
  const dir = path.join(OUT, "media");
  await mkdir(dir, { recursive: true });
  for (const m of media) {
    const file = path.join(dir, `${m.id}-${path.basename(new URL(m.source_url).pathname)}`);
    const res = await fetch(m.source_url);
    if (!res.ok) { console.warn(`skip ${m.source_url}: HTTP ${res.status}`); continue; }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  }
  console.log(`downloaded ${media.length} media files`);
}
