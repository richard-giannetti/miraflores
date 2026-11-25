# Roadmap

## Step 1 — Website rebuild (current)

- [x] Export WordPress content, SEO metadata and media list (`migration/`)
- [x] Download and optimise images (WebP/AVIF, responsive sizes)
- [x] Scaffold `apps/web` with Astro
- [x] Rebuild pages: group home, each villa (home, rooms, amenities, gallery, things to do, contact), blog
- [x] SEO: clean URLs, 301 redirects from every old URL, `LodgingBusiness`
      structured data, sitemap, Open Graph images, per-page titles/descriptions
- [ ] Spanish version
- [x] "Book on Airbnb" buttons per villa
- [ ] Contact form (today: email link)
- [ ] Replace the `/checking` guest check-in form (ID documents) — likely part of the PMS
- [ ] Deploy to Cloudflare Pages
- [ ] Google Search Console + analytics
- [ ] Switch DNS from WordPress hosting to the new host

## Step 2 — Property management system

- [ ] Pick stack (ADR)
- [ ] Unified calendar for both villas, synced with Airbnb via iCal
- [ ] Bookings and guest records
- [ ] Cleaning / turnover schedule
- [ ] Income and expense overview

## Step 3 — Direct bookings

- [ ] Live availability on the website (from the PMS)
- [ ] Pricing rules (season, minimum nights, cleaning fee)
- [ ] Checkout with Stripe, confirmation emails
- [ ] PMS exports `.ics` back to Airbnb so direct bookings block Airbnb dates
