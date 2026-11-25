# apps/web — public website

Astro static site for miraflorescostatropical.com.

```bash
pnpm --filter @miraflores/web dev     # http://localhost:4321
pnpm --filter @miraflores/web build   # output in apps/web/dist
```

## Where things live

| What | Where |
|---|---|
| Villa text, facts, amenities, photos, booking links | `src/data/villas.ts` |
| Things to do | `src/data/experiences.ts` |
| Guest reviews | `src/data/reviews.ts` |
| Email, Instagram, nav | `src/data/site.ts` |
| Blog posts (Markdown + images) | `src/content/blog/<slug>/index.md` |
| Photos | `src/assets/` (originals ≤ 2400px; Astro makes the responsive WebP sizes) |
| Redirects from old WordPress URLs | `public/_redirects` |

To add a blog post, copy a folder in `src/content/blog/`, rename it (the folder name is the URL),
and edit the front matter and text.
