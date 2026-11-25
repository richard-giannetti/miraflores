#!/usr/bin/env node
// Converts exported WordPress posts into Markdown files for apps/web's blog collection,
// copying their images next to them. Run wp-export.mjs --media first.

import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";

const EXPORT = path.join(import.meta.dirname, "export");
const OUT = path.join(import.meta.dirname, "../apps/web/src/content/blog");
const load = async (f) => JSON.parse(await readFile(path.join(EXPORT, f), "utf8"));

const [posts, media, categories] = await Promise.all([load("posts.json"), load("media.json"), load("categories.json")]);
const mediaFiles = await readdir(path.join(EXPORT, "media"));
const fileFor = (url) => {
  const base = path.basename(new URL(url).pathname).replace(/-\d+x\d+(\.\w+)$/, "$1");
  return mediaFiles.find((f) => f.replace(/^\d+-/, "") === base);
};
const decode = (s) => s.replace(/&#8217;/g, "’").replace(/&#8211;/g, "–").replace(/&#8220;|&#8221;/g, '"').replace(/&amp;/g, "&").replace(/&#038;/g, "&");

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

for (const post of posts) {
  const dir = path.join(OUT, post.slug);
  await mkdir(dir, { recursive: true });

  const copied = [];
  td.addRule("images", {
    filter: "img",
    replacement: (_, node) => {
      const file = fileFor(node.getAttribute("src"));
      if (!file) return "";
      const name = file.replace(/^\d+-/, "");
      copied.push([file, name]);
      return `![${node.getAttribute("alt") || ""}](./${name})`;
    },
  });
  const body = td.turndown(post.content.rendered);

  const featured = media.find((m) => m.id === post.featured_media);
  let cover = featured && fileFor(featured.source_url);
  if (cover) copied.push([cover, cover.replace(/^\d+-/, "")]);
  for (const [src, name] of copied) await copyFile(path.join(EXPORT, "media", src), path.join(dir, name));
  const coverName = cover ? cover.replace(/^\d+-/, "") : copied[0]?.[1];

  const cats = post.categories.map((id) => categories.find((c) => c.id === id)).filter((c) => c && c.slug !== "uncategorized");
  const fm = {
    title: decode(post.title.rendered),
    description: decode(post.yoast_head_json?.description ?? post.excerpt.rendered.replace(/<[^>]+>/g, "").trim()).slice(0, 300),
    pubDate: post.date.slice(0, 10),
    updatedDate: post.modified.slice(0, 10),
    categories: cats.map((c) => c.slug),
    ...(coverName && { cover: `./${coverName}` }),
  };
  await writeFile(path.join(dir, "index.md"), `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n${body}\n`);
  console.log(`${post.slug}: ${copied.length} images`);
}
