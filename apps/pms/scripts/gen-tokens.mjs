// Generates src/design/tokens.css from src/design/tokens.json (the macOS 26 UI design system in Claude).
// Run: node scripts/gen-tokens.mjs
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../src/design/", import.meta.url);
const t = JSON.parse(readFileSync(new URL("tokens.json", dir)));
const [first, ...rest] = t.color.themes.map((x) => x.id);
const val = (v, theme) => (typeof v === "string" ? v : v[theme] ?? v[first]);
const ref = (s) => String(s).replace(/^\{(.+)\}$/, "var(--$1)");
const lines = (theme) => {
  const out = [];
  for (const k of t.color.tokens) out.push(`  --${k.name}: ${ref(val(k.value, theme))};`);
  if (theme === first) {
    for (const [n, f] of Object.entries(t.type.families)) out.push(`  --font-${n}: ${f};`);
    for (const fam of ["spacing", "radius", "size", "blur"]) for (const k of t[fam].tokens) out.push(`  --${k.name}: ${k.value};`);
    for (const g of t.type.groups) for (const s of g.styles) out.push(`  --text-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${g.family});`);
  }
  for (const k of t.shadow.tokens) out.push(`  --${k.name}: ${val(k.value, theme)};`);
  return out.join("\n");
};
const dark = rest[0];
const css = `/* ${t.name} — generated from tokens.json by scripts/gen-tokens.mjs. Do not edit by hand. */
:root, [data-theme="${first}"] {
  color-scheme: ${first};
${lines(first)}
}
@media (prefers-color-scheme: ${dark}) {
  :root:not([data-theme="${first}"]) {
  color-scheme: ${dark};
${lines(dark)}
  }
}
[data-theme="${dark}"] {
  color-scheme: ${dark};
${lines(dark)}
}
`;
writeFileSync(new URL("tokens.css", dir), css);
console.log("wrote tokens.css");
