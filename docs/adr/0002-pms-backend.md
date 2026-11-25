# ADR 0002 — PMS backend: Supabase (Postgres), app on Cloudflare

**Status:** proposed · 2026-11-25

## Context

The PMS ([feature draft](../pms/features.md)) needs:
- A relational database where reservations can't overlap, even if two people book at the same time.
- Logins with roles: owners, managers, staff, plus guests using a private check-in link.
- File storage for cleaning and maintenance photos and signatures.
- Scheduled jobs: iCal sync every few minutes, reminders, data deletion after 3 years.
- Hosting in the EU, because it stores identity data of guests.
- A free start, and a cheap, predictable path once it carries real operations.

The volume is small: two villas, a few hundred reservations a year, fewer than 20 users. A hotel later
adds rooms and bookings, but stays well within small-database territory.

## Options

| | Supabase | Cloudflare D1 + Workers | Firebase | PocketBase |
| --- | --- | --- | --- | --- |
| Database | Postgres | SQLite | NoSQL documents | SQLite |
| No-overlap rule in the DB | Yes (exclusion constraint) | No, app code only | No | No |
| Logins and roles | Built in; row-level security | Build or add (Cloudflare Access for staff only) | Built in | Built in |
| File storage | 1 GB free | R2, 10 GB free | 5 GB free | Local disk |
| Admin table view | Yes, a dashboard | Basic console | Yes | Yes |
| EU hosting | Choose an EU region | Global; jurisdiction controls on paid plans | Choose a region | Wherever we host it |
| Free tier | 500 MB DB, 1 GB files, 50k monthly users, 2 projects | 500 MB per DB, 5 GB total, 5M reads and 100k writes a day | Generous; pay as you go | Free software, but needs a server |
| Main catch | **Pauses after 7 days without activity**; no point-in-time recovery on Free | Daily caps enforced since Sept 2026; more to build | Document model is a poor fit for bookings and reports; lock-in | We run and patch the server |

## Decision

**Supabase** for the database, logins and file storage, **in an EU region** (Frankfurt or Paris).
The PMS web app is hosted on **Cloudflare Workers**, next to the website.

- **Postgres** suits the data: properties → units → reservations, guests, tasks, staff and shifts,
  money. A `daterange` exclusion constraint makes double bookings impossible at the database level.
  SQL reporting (occupancy, revenue) is straightforward.
- **Supabase Auth with row-level security:** staff see only their own tasks; guests reach only their
  own check-in form through a signed link; only owners see ID data.
- **Supabase's dashboard** lets the family inspect and fix data in an emergency, without code.
- **It's plain Postgres:** if Supabase stops suiting us, the data moves to any Postgres host with `pg_dump`.
- **Cloudflare:** the website is already there, a single account manages the domain, and hosting
  `pms.miraflorescostatropical.com` is free there.

### Living with the free tier

- **Pause after a week without activity:** the parents will use it daily, and a scheduled job
  (the iCal sync) touches the database every few minutes anyway.
- **No managed backups to rely on:** a nightly GitHub Action runs `pg_dump`, encrypts the file and stores
  it outside Supabase, on Cloudflare R2 (free up to 10 GB). We test a restore once before going live.
- **1 GB file storage:** photos are compressed in the browser before upload. If that's still not enough,
  they move to R2.
- **When to pay:** once the system is the real record of operations, Supabase Pro (about $25/month)
  removes the pause and adds daily backups. Expected around go-live of the MVP, not before.

### Other pieces

- **Email** (check-in links, confirmations): a transactional email service on its free tier
  (Resend, or Brevo for EU hosting), sent from `@miraflorescostatropical.com`.
- **Invoicing:** a certified VeriFactu invoicing API signs and numbers invoices; the PMS keeps the data,
  PDF and QR. We don't certify our own signing.
- **Payments** (phase C): Stripe.
- **Airbnb:** iCal import and export only (see the feature draft for why).
- **SES.Hospedajes:** start with assisted manual submission; then build the web-service client.

## Consequences

- `apps/pms` becomes a TypeScript web app. The front-end framework gets picked when the MVP starts:
  Astro islands to match the website, or SvelteKit or React for a more app-like back-office.
- Database schema and policies live in the repo as Supabase migrations (`supabase/migrations`),
  reviewed in PRs like any code.
- Two places to manage: Cloudflare (hosting, DNS, backups in R2) and Supabase (data). Both under the
  family's own accounts.
- Guest ID data leaves Airbnb and enters a system we're responsible for. That's GDPR work: a privacy
  notice on the check-in form, access controls, deletion after 3 years.

## Sources

- Supabase free tier and pausing: [Supabase pricing](https://supabase.com/pricing),
  [UI Bakery breakdown (2026)](https://uibakery.io/blog/supabase-pricing),
  [MyKavo](https://mykavo.app/blog/supabase-free-tier-limits)
- Supabase backups: [docs](https://supabase.com/docs/guides/platform/backups)
- Cloudflare D1 limits: [limits](https://developers.cloudflare.com/d1/platform/limits),
  [free-tier enforcement, Sept 2026](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
