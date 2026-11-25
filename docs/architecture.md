# Architecture

## Goals

1. **Now:** a fast, SEO-friendly website for both villas that ranks for searches like
   "villa with pool Costa Tropical", "holiday rental Calahonda", "La Rijana beach accommodation".
   Bookings still go through Airbnb.
2. **Next:** a management system for the owners to run both villas in one place.
3. **Later:** direct bookings on our own website (no Airbnb commission), sharing one
   availability calendar with Airbnb so nothing is double-booked.

The repo is shaped from day 0 so goal 3 is an addition, not a rewrite.

## Shape

```
                 ┌──────────────────────┐
  Guests ──────► │ apps/web  (Astro)    │  static pages, blog, galleries
                 │ public website       │  later: availability + "Book direct"
                 └──────────┬───────────┘
                            │ (later) reads availability / creates booking
                 ┌──────────▼───────────┐
  Parents ─────► │ apps/pms             │  calendar, bookings, guests,
                 │ owner back-office    │  cleaning, payments, reports
                 └──────────┬───────────┘
                            │ iCal sync (import + export)
                 ┌──────────▼───────────┐
                 │ Airbnb / Booking.com │
                 └──────────────────────┘
```

## Decisions

- **Monorepo with pnpm workspaces** — one repo, one place for issues; website and PMS
  share the same "Property / Booking" vocabulary. See [ADR 0001](adr/0001-monorepo-and-astro.md).
- **Website: Astro, statically generated.** Pages are plain HTML on a CDN: top Core Web
  Vitals scores, full control of meta tags, structured data and sitemaps. Content lives
  as Markdown in the repo — no WordPress to patch or pay for.
- **Hosting: Cloudflare Pages or Vercel** (free tier is enough for the website).
- **Bilingual from the start: English + Spanish** (`/` and `/es/`, with `hreflang`). Room to add
  German/Dutch later — big Costa Tropical markets.
- **Airbnb integration = iCal**, the only channel-sync Airbnb offers to non-partners. Each
  villa's Airbnb calendar exports an `.ics` URL; the PMS imports it and publishes its own
  `.ics` for Airbnb to import back. This is what makes direct booking safe later.
- **PMS stack: decided at the start of step 2.** Likely a TypeScript web app with Postgres
  (e.g. Supabase) and Stripe for direct-booking payments. Not chosen yet on purpose.

## What is deliberately *not* here yet

- No database, auth or payments — nothing needs them until step 2.
- No shared `packages/` — created when the PMS needs code the website already has.
