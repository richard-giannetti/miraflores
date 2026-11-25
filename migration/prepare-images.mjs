#!/usr/bin/env node
// Copies the images the new site uses from export/media into apps/web/src/assets,
// renamed and downscaled (max 2400px wide). Astro generates the responsive sizes at build.
// Usage: node migration/prepare-images.mjs   (run wp-export.mjs --media first)

import { readdir, mkdir, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const sharp = require("sharp");

const MEDIA = path.join(import.meta.dirname, "export/media");
const ASSETS = path.join(import.meta.dirname, "../apps/web/src/assets");

// destination (relative to src/assets, no extension) -> original WordPress filename
const MAP = {
  "brand/logo": "cropped-Logo-name.png",
  "brand/emblem": "Logo-short.png",
  "family": "20231222_211249_01-scaled.jpg",

  "los-olivos/hero": "20231224_120956-HDR-scaled.jpg",
  "los-olivos/welcome": "20231224_121614-HDR-scaled.jpg",
  "los-olivos/pool-view": "Piscine-2.jpeg",
  "los-olivos/room-feature": "20231224_122548-HDR-scaled.jpg",
  "los-olivos/amenities-feature": "20231224_134910-scaled.jpg",
  "los-olivos/terrace": "20231224_120737-HDR-scaled.jpg",
  "los-olivos/pool": "20231224_140204-scaled.jpg",
  "los-olivos/suite": "20231224_125626-HDR-scaled.jpg",
  "los-olivos/cover": "20231224_135719-scaled.jpg",
  "los-olivos/living": "20231224_131305-HDR-scaled.jpg",
  "los-olivos/kitchen": "20231224_122656-HDR-1-scaled.jpg",
  "los-olivos/outdoors": "20231224_140311_01-scaled.jpg",
  "los-olivos/terrace-2": "20231224_120521-HDR-scaled.jpg",
  "los-olivos/welcome-2": "20231224_131420-HDR-scaled.jpg",
  "los-olivos/wellness": "20231224_140355-scaled.jpg",
  "los-olivos/gallery-01": "20231224_134404-scaled.jpg",
  "los-olivos/gallery-02": "20231224_134438-scaled.jpg",
  "los-olivos/gallery-03": "20231224_134507-scaled.jpg",
  "los-olivos/gallery-04": "20231224_140335-scaled.jpg",
  "los-olivos/gallery-05": "20231224_120609-HDR-scaled.jpg",
  "los-olivos/gallery-06": "20231224_135440_01-scaled.jpg",
  "los-olivos/gallery-07": "20231224_140726_01-scaled.jpg",
  "los-olivos/gallery-08": "20231224_125427-HDR-scaled.jpg",
  "los-olivos/gallery-09": "20231224_140748-scaled.jpg",
  "los-olivos/gallery-10": "20231224_141251-scaled.jpg",

  "la-playa/hero": "20240619_211106-HDR_Original-scaled.jpg",
  "la-playa/welcome": "20250109_140936-HDR-scaled.jpg",
  "la-playa/beachfront": "20250109_141050-scaled.jpg",
  "la-playa/room-feature": "20250109_133202-HDR-scaled.jpg",
  "la-playa/amenities-feature": "20240619_210747-HDR-scaled.jpg",
  "la-playa/getting-there": "20250109_135003-HDR-1-scaled.jpg",
  "la-playa/outdoors": "20250109_135919-HDR-scaled.jpg",
  "la-playa/rooftop": "Rooftop-1.jpg",
  "la-playa/rooftop-2": "Rooftop.jpg",
  "la-playa/terrace": "20240619_202428-HDR-scaled.jpg",
  "la-playa/lounge": "20250109_140246-HDR-scaled.jpg",
  "la-playa/indoors": "20250109_132401-HDR-scaled.jpg",
  "la-playa/suite": "20250109_132820-HDR-scaled.jpg",
  "la-playa/room": "20250109_133815-scaled.jpg",
  "la-playa/decor": "20250109_135220-HDR-scaled.jpg",
  "la-playa/kitchen": "20250109_135042-HDR-scaled.jpg",
  "la-playa/living": "Livingroom.jpg",

  "experiences/private-chef": "Jamon-scaled.jpg",
  "experiences/events": "20231222_214607-scaled.jpg",
  "experiences/beaches": "PlayaJijana.jpg.webp",
  "experiences/granada": "alhambra-granada-20044065-istock.jpg_1014274486.jpg.jpg",
  "experiences/nerja": "Nerja.jpg",
  "experiences/alpujarra": "Alpujarra.jpg",
  "experiences/water-sports": "IMG_8472-1024x768-1.jpeg",
  "experiences/padel": "upmotril-Padel.jpg",
  "experiences/golf": "los-moriscos-club-de-golf_093948_full.jpg",
  "experiences/malaga-espetos": "espetos-authentic-sardines-in-malaga.jpg",
  "experiences/granada-food": "DSC02176-1-e1704141043583.jpg",
  "experiences/la-roka": "G7A3164.jpg",
};

const files = await readdir(MEDIA);
const byName = new Map(files.map((f) => [f.replace(/^\d+-/, ""), f]));

for (const [dest, name] of Object.entries(MAP)) {
  const src = byName.get(name);
  if (!src) { console.warn(`missing: ${name}`); continue; }
  const isPng = name.endsWith(".png");
  const out = path.join(ASSETS, `${dest}.${isPng ? "png" : "jpg"}`);
  await mkdir(path.dirname(out), { recursive: true });
  const img = sharp(path.join(MEDIA, src)).rotate().resize({ width: 2400, withoutEnlargement: true });
  await (isPng ? img.png() : img.jpeg({ quality: 82, mozjpeg: true })).toFile(out);
}
// The logo PNGs have a solid white background: turn white into transparency.
for (const dest of ["brand/logo", "brand/emblem"]) {
  const file = path.join(ASSETS, `${dest}.png`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lightness = Math.min(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = Math.max(0, Math.min(255, Math.round(((250 - lightness) / 120) * 255)));
  }
  await sharp(data, { raw: info }).trim().png().toFile(file + ".tmp");
  await rename(file + ".tmp", file);
}

console.log(`prepared ${Object.keys(MAP).length} images`);
