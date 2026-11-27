// ID scan at online check-in: read the machine-readable lines (the ones with <<<) of a passport or ID card from a
// photo, entirely in the guest's browser (the photo is never uploaded or stored), and turn them into form fields.
// The guest always checks the result before sending.
import { parse, type ParseResult } from "mrz";
import type { Traveller } from "./checkin";

// MRZ lines: 44 characters (passports, TD3), 36 (TD2) or 30 (ID cards, TD1), only A–Z, 0–9 and <.
const LENGTHS = [44, 36, 30];

// OCR reads the long runs of < filler as K, L or X ("CLAIRE<L<KLLLLL"): a run of 5+ of those that contains a < is
// filler. Then a line that came out too long or too short is fixed inside its longest filler run, so the check
// digits at the end keep their place.
function cleanLine(l: string) {
  return l.replace(/[<KLX]{5,}/g, (m) => (m.includes("<") ? "<".repeat(m.length) : m));
}
function fitLine(l: string, len: number) {
  if (l.length === len) return l;
  const runs = [...l.matchAll(/<{2,}/g)].sort((a, b) => b[0].length - a[0].length);
  const run = runs[0];
  if (!run || run.index === undefined) return l.length > len ? l.slice(0, len) : l.padEnd(len, "<");
  const keep = Math.max(1, run[0].length - (l.length - len));
  const fixed = l.slice(0, run.index) + "<".repeat(keep) + l.slice(run.index + run[0].length);
  return fixed.length > len ? fixed.slice(0, len) : fixed.padEnd(len, "<");
}

// From raw OCR text, the most plausible block of MRZ lines (2 × 44, 2 × 36 or 3 × 30).
export function extractMrzLines(text: string): string[] | null {
  const lines = text
    .toUpperCase()
    .split(/\n/)
    .map((l) => cleanLine(l.replace(/\s+/g, "").replace(/[«‹]/g, "<").replace(/[^A-Z0-9<]/g, "")))
    .filter((l) => l.length >= 26 && l.includes("<"));
  // Each line belongs to the format whose length it's closest to; the format with enough lines wins.
  const nearest = (l: string) => LENGTHS.reduce((best, len) => (Math.abs(l.length - len) < Math.abs(l.length - best) ? len : best));
  for (const len of LENGTHS) {
    const count = len === 30 ? 3 : 2;
    const fit = lines.filter((l) => nearest(l) === len && Math.abs(l.length - len) <= 8).map((l) => fitLine(l, len));
    if (fit.length >= count) return fit.slice(-count);
  }
  return null;
}

// YYMMDD → YYYY-MM-DD. Birth dates are in the past: a year after this one belongs to the 1900s.
function birthDay(v: string | null | undefined) {
  if (!v || !/^\d{6}$/.test(v)) return "";
  const yy = Number(v.slice(0, 2));
  const now = new Date().getFullYear() % 100;
  return `${yy > now ? 1900 + yy : 2000 + yy}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
}

// MRZ uses ICAO codes; a few differ from ISO 3166 alpha-3.
const ICAO: Record<string, string> = { D: "DEU", GBD: "GBR", GBN: "GBR", GBO: "GBR", GBP: "GBR", GBS: "GBR", UTO: "", XXA: "", XXB: "", XXC: "", XXX: "", RKS: "XKX" };
const country = (c: string | null | undefined) => {
  const v = (c ?? "").replace(/</g, "");
  return v in ICAO ? ICAO[v] : v.length === 3 ? v : "";
};
const words = (s: string | null | undefined) => (s ?? "").replace(/</g, " ").replace(/\s+/g, " ").trim();
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

export type Scanned = Partial<Pick<Traveller, "first_name" | "last_name_1" | "last_name_2" | "sex" | "birth_date" | "nationality" | "doc_type" | "doc_number" | "doc_support_number">>;

export function mrzToTraveller(r: ParseResult): Scanned {
  const f = r.fields;
  const nationality = country(f.nationality);
  const issuer = country(f.issuingState);
  const passport = (f.documentCode ?? "").startsWith("P");
  const surnames = title(words(f.lastName));
  // Spanish documents carry two surnames; elsewhere the whole surname goes in the first field.
  const [s1, ...rest] = nationality === "ESP" ? surnames.split(" ") : [surnames];
  const out: Scanned = {
    first_name: title(words(f.firstName)),
    last_name_1: s1 ?? "",
    last_name_2: rest.join(" "),
    birth_date: birthDay(f.birthDate),
    nationality,
    sex: f.sex === "male" ? "M" : f.sex === "female" ? "F" : undefined,
  };
  const docNumber = (f.documentNumber ?? "").replace(/[<\s]/g, "");
  if (passport) {
    out.doc_type = "PASSPORT";
    out.doc_number = docNumber;
  } else if (issuer === "ESP") {
    // Spanish DNI and NIE cards: the MRZ "document number" is the card's support number; the DNI or NIE itself is
    // in the optional field.
    // Only the number itself: the rest of that field is filler that OCR sometimes reads as letters.
    const id = (f.optional1 ?? f.optional ?? "").replace(/[<\s]/g, "").match(/^[XYZ]?\d{7,8}[A-Z]/)?.[0] ?? "";
    out.doc_type = /^[XYZ]/.test(id) ? "NIE" : "DNI";
    out.doc_number = id;
    out.doc_support_number = docNumber;
  } else {
    out.doc_type = "ID_CARD";
    out.doc_number = docNumber;
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Scanned;
}

export function parseMrz(text: string): { fields: Scanned; valid: boolean } | null {
  const lines = extractMrzLines(text);
  if (!lines) return null;
  try {
    const r = parse(lines, { autocorrect: true });
    const fields = mrzToTraveller(r);
    return fields.doc_number && fields.birth_date ? { fields, valid: r.valid } : null;
  } catch {
    return null;
  }
}

// Shrink and boost contrast so the OCR reads the MRZ well; `bottom` keeps only the lower part of the picture,
// where the MRZ is on passports and on the back of ID cards.
async function prepare(file: File, bottom: number) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / img.width);
  const w = Math.round(img.width * scale);
  const fullH = Math.round(img.height * scale);
  const h = Math.round(fullH * bottom);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.6)";
  ctx.drawImage(img, 0, img.height * (1 - bottom), img.width, img.height * bottom, 0, 0, w, h);
  img.close();
  return canvas;
}

// The OCR engine (Tesseract, loaded on first use from a CDN; ~4 MB the first time), restricted to MRZ characters.
export async function scanDocument(file: File) {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<", tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    // First the bottom of the picture (fast, usually enough), then the whole picture.
    for (const part of [0.45, 1]) {
      const { data } = await worker.recognize(await prepare(file, part));
      const found = parseMrz(data.text);
      if (found) return found;
    }
    return null;
  } finally {
    await worker.terminate();
  }
}
