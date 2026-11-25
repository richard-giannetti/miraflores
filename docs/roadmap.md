# Roadmap

## Step 1 — Website rebuild (current)

- [x] Export WordPress content, SEO metadata and media list (`migration/`)
- [x] Download and optimise images (WebP/AVIF, responsive sizes)
- [x] Scaffold `apps/web` with Astro
- [x] Rebuild pages: group home, each villa (home, rooms, amenities, gallery, things to do, contact), blog
- [x] SEO: clean URLs, 301 redirects from every old URL, `LodgingBusiness`
      structured data, sitemap, Open Graph images, per-page titles/descriptions
- [x] Spanish version (`/es/`, translated URLs, hreflang, language switcher, blog translated)
- [x] "Book on Airbnb" buttons per villa
- [x] Contact form (Web3Forms; shows once `contactFormKey` is set in `apps/web/src/data/site.ts`)
- [x] Interim `/checking/` page: guests are told details are collected via Airbnb messages
- [x] Airbnb reviews + rating card (Villa Los Olivos; also shown on La Playa, labelled as the sister villa's)
- [ ] Villa La Playa's own Airbnb reviews
- [ ] Deploy to Cloudflare (Workers static assets, see `wrangler.jsonc`)
- [ ] Google Search Console + analytics
- [ ] Switch DNS from WordPress hosting to the new host

## Step 2 — Property management system

- [ ] Pick stack (ADR)
- [ ] Unified calendar for both villas, synced with Airbnb via iCal
- [ ] Bookings and guest records
- [ ] Online guest check-in (replaces the old `/checking` form): ID/passport details for the
      Spanish guest registration requirement, stored securely, not on the public website
- [ ] Cleaning / turnover schedule
- [ ] Income and expense overview

## Step 3 — Direct bookings

- [ ] Live availability on the website (from the PMS)
- [ ] Pricing rules (season, minimum nights, cleaning fee)
- [ ] Checkout with Stripe, confirmation emails
- [ ] PMS exports `.ics` back to Airbnb so direct bookings block Airbnb dates
