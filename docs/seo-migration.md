# SEO migration plan

Google has indexed the current URLs. Every one of them must either stay the same or
301-redirect to its new home, or we lose rankings. The redirects live in
[`apps/web/public/_redirects`](../apps/web/public/_redirects) (Cloudflare Pages / Netlify format).
Titles and descriptions from Yoast are in `migration/export/seo.json`.

| Old URL | New URL |
|---|---|
| `/` | `/` |
| `/group-home/discover-villa-los-olivos` | `/villa-los-olivos/` |
| `/losolivos-rooms-list` | `/villa-los-olivos/rooms/` |
| `/losolivos-amenities` | `/villa-los-olivos/amenities/` |
| `/losolivos-gallery` | `/villa-los-olivos/gallery/` |
| `/losolivos-things-to-do` | `/things-to-do-costa-tropical/` (one page for both villas) |
| `/losolivos-contact-us` | `/contact/` (one page for both villas) |
| `/group-home/homepage-la-playa-calahonda` | `/villa-la-playa-calahonda/` |
| `/rooms-list-la-playa-calahonda` | `/villa-la-playa-calahonda/rooms/` |
| `/amenities-la-playa-calahonda` | `/villa-la-playa-calahonda/amenities/` |
| `/gallery-la-playa-calahonda` | `/villa-la-playa-calahonda/gallery/` |
| `/things-to-do-la-playa-calahonda` | `/things-to-do-costa-tropical/` |
| `/contact-us-la-playa-calahonda` | `/contact/` |
| `/blog` | `/blog/` |
| `/blog/<slug>` | `/blog/<slug>/` (unchanged) |
| `/blog/category/<cat>` | `/blog/category/<cat>/` (unchanged) |
| `/blog/tag/<tag>` | `/blog/` |
| `/checking` | not on the public site — moves to the management system (step 2) |

The two "things to do" and two "contact" pages were near-identical copies; merging each pair
into one page avoids duplicate content and concentrates ranking signals.

## What the new site adds

- Unique `<title>` (≤ ~60 chars) and meta description on every page; the old homepage had none.
- `LodgingBusiness` structured data per villa, `BlogPosting` per post, `BreadcrumbList`, `Organization`.
- `sitemap-index.xml` + `robots.txt`, canonical URLs, Open Graph images.
- Responsive WebP images and self-hosted fonts (no Google Fonts requests, which is also better for GDPR).

## Before switching DNS

1. Deploy `apps/web` to Cloudflare Pages (build command `pnpm --filter @miraflores/web build`,
   output `apps/web/dist`) and check it on the `*.pages.dev` URL.
2. Make sure guests are no longer sent to `/checking` (it moves to the management system).
3. Point the domain at the new host; keep WordPress hosting for a few weeks as a fallback.
4. In Google Search Console: submit the new sitemap, and spot-check old URLs redirect with 301.
