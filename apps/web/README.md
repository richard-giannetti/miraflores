# apps/web — public website

Astro static site for miraflorescostatropical.com.

```bash
pnpm --filter @miraflores/web dev     # http://localhost:4321
pnpm --filter @miraflores/web build   # output in apps/web/dist
```

## Where things live

| What | Where |
|---|---|
| Page layouts (shared by both languages) | `src/views/` |
| Route files (thin: pick a view and a language) | `src/pages/` (English) and `src/pages/es/` (Spanish) |
| URLs per language, interface text, `pick()` helper | `src/i18n/index.ts` |
| Villa text, facts, amenities, photos, booking links | `src/data/villas.ts` |
| Things to do | `src/data/experiences.ts` |
| Guest reviews | `src/data/reviews.ts` |
| Email, Instagram, nav | `src/data/site.ts` |
| Blog posts (Markdown + images) | `src/content/blog/<slug>/index.md` |
| Photos | `src/assets/` (originals ≤ 2400px; Astro makes the responsive WebP sizes) |
| Redirects from old WordPress URLs | `public/_redirects` |

## Languages

Text lives next to its translation as `{ en: "...", es: "..." }`; `pick(data, lang)` resolves it.
Page text sits at the top of each view in `src/views/`. Spanish URLs are defined in `src/i18n/index.ts`.

## Blog

To add a post, copy a folder in `src/content/blog/` and rename it (the folder name is the URL).
Its Spanish version goes in `src/content/blog/es/<spanish-slug>/index.md`, with
`translationOf: "<english-folder-name>"` in the front matter; images can point at the English
folder (`../../<english-folder>/photo.jpg`).
