# apps/pms — property management system

The back-office for both villas: [features](../../docs/pms/features.md),
[backend decision](../../docs/adr/0002-pms-backend.md). React + Vite single-page app, data in Supabase
(project `miraflores`, EU), served by the `miraflores-pms` Cloudflare Worker at `pms.miraflorescostatropical.com`.

## Wave 1 so far

- Sign-in with email and password; accounts are created by an owner in Supabase (no public sign-up).
- Calendar: a timeline per villa. Drag across days to create a reservation, drag a reservation to move it
  (also to the other villa), drag its right edge to change departure, click to edit.
- Bookings and blocks; the guest's main details; source and status colours.
- Double bookings are refused by the database (`reservations_no_overlap`).
- Live updates between devices; the last loaded data stays readable offline.
- Interface in Spanish, French and English.
- **Today** screen: arrivals, departures, in house, blocks, and the cleaning due (or overdue), with
  one-tap "checked in / checked out".
- **Cleaning**: a task is created automatically for every booking's departure day and follows the booking
  (moved, cancelled, reconfirmed). Shows who's leaving and the next arrival (warns on same-day turnovers).
  Assign to a team member, tick the villa's checklist, add notes, mark done (who and when is recorded).
- **Guests**: search, profile with contact details, nationality, language, notes and every stay.
- **Online check-in** (Wave 2): "Create check-in link" in a booking gives a private link `/c/<token>`
  (copy, WhatsApp, email). The guest page (EN/ES/FR) collects every traveller's SES.Hospedajes data,
  arrival time, optional company invoice details, house-rules acceptance and signature, then shows the
  villa guide (Wi-Fi, directions…). The guest page only uses the `checkin_get` / `checkin_submit` database
  functions. Owners see the registration, print the traveller sheet and mark it as sent to SES.
  Registration data is deleted 3 years after departure (nightly pg_cron job). Guide texts: ⚙ Settings.
- **Invoices** (Wave 2, owners and managers): draft from a reservation in one click, edit customer and lines
  (enter prices with or without VAT), issue. Issuing numbers the invoice in its series with no gaps
  (`F2026-0001`, `S…` simplified, `R…` corrective), dates it today, freezes the company details and locks it;
  corrections go through a corrective invoice. Printable bilingual (ES/EN) invoice, save as PDF from the browser.
  Company details (NIF, address, default VAT) under "Company details" (owners).
  **Not yet VeriFactu-signed**: from 2027 a certified service must sign them (see docs/pms/features.md, module 9).

## Wave 2, the rest of internal management

- **Team** (owners and managers): people and departments, one login each (an owner sets a temporary password
  through the `staff-admin` Edge Function), weekly schedule, and the hours register. Staff clock in and out on
  "My time" and on Today; corrections go through database functions that log the reason.
- **Maintenance** (everyone): report an issue with photos (private `issue-photos` bucket), assign it, follow it
  to resolved. Recurring jobs open their issue a few days ahead (nightly `spawn-recurring-issues` job) and
  schedule the next one when it's resolved. Urgent and assigned issues show on Today.
- **Money** (owners and managers): income and expenses per villa, Airbnb's earnings CSV import (gross as income,
  host fee as expense, never twice), CSV export for the gestor, and a yearly summary: occupancy, average nightly
  rate, revenue per available night, channels, lead time, nationalities, monthly result.
- **Guest messages**: templates in EN/ES/FR with placeholders and a moment (days before arrival…), edited in
  Settings. Today lists the ones due; a tap opens WhatsApp or email with the text ready, or copies it, and
  records the send. Airbnb guests are skipped unless a template says otherwise. No email provider yet: sending
  goes through the family's own WhatsApp and mail app.
- On phones, the tab bar shows four tabs and "More" for the rest.

## Wave 3: connecting to the outside

- **Airbnb calendar sync (iCal), both ways.** Settings → Airbnb calendar sync, per villa:
  - *Airbnb calendar* (owners): the villa's Airbnb export link. The `ical-sync` Edge Function reads it every hour
    (pg_cron, at :07, authenticated by a Vault secret) or on "Sync now": new Airbnb reservations become bookings
    (source airbnb, keyed by the HM… code), hand-typed ones with the same dates are linked, moved ones follow,
    vanished ones are cancelled. An Airbnb booking that overlaps one already here is refused by the database and
    reported as a conflict (Settings and a warning on Today). Airbnb's "Not available" events are ignored.
  - *PMS link*: `ical-export?t=<units.ical_token>`, the villa's own bookings and blocks (not Airbnb's) for Airbnb
    to import. Airbnb refreshes imported calendars every few hours, so a direct booking takes a while to close
    the dates there.

- **Rates** (owners and managers, "Rates" tab): per villa, price per night and for Friday/Saturday, seasons
  (the shorter one wins where they overlap), cleaning fee, guests included and extra-guest fee, minimum stay,
  booking window, gap nights (shorter minimum and a discount for short gaps), rate types that switch on by
  themselves (early bird, last minute, non-refundable), and promo codes. One calculation, `public.quote()`, is used
  by the PMS price check and the website, so both always show the same price.
- **Book direct on the website**: a villa opened to direct booking (a switch in Rates) shows a form on its pages:
  dates, guests, promo code → price and rate options → a request (`public.request_booking()`, recalculated
  server-side, rate-limited). Requests don't block dates; they show on Today, where an owner or manager accepts
  them (as an option or confirmed: guest and booking are created) or declines. Card payment comes with Stripe.
- Channels: direct and Airbnb only (Booking.com is out for now).
- **Card payments (Stripe)**: in a booking, "Card payments" creates a deposit link (the villa's deposit % from
  Rates), a link for the balance or any amount. The guest's lasting link `/pay/<token>` opens Stripe Checkout
  (the `payments` Edge Function makes a fresh session each time). Stripe's webhook (`stripe-webhook`, signature
  checked) marks it paid, confirms an option booking and records the income in Money; refunds start from the
  booking and come back as "Refunds" expenses. Each payment also prepares a **draft invoice** (`draft_invoice_for_payment`):
  per payment (deposit as an advance, balance = the rest of the stay) or one per stay, as set in Company details;
  the family checks and issues it. A refund on an issued invoice shows a reminder to issue a corrective one. Secrets: `STRIPE_SECRET_KEY` (restricted key) and
  `STRIPE_WEBHOOK_SECRET`, set in Supabase → Edge Functions → Secrets, never in the code.

## Design system

The interface follows the **macOS 26 UI** design system (a Design System artifact in Claude). Its tokens live in
`src/design/tokens.json`; `node scripts/gen-tokens.mjs` turns them into `src/design/tokens.css` (light and dark,
following the device). `src/styles.css` uses only those variables — no hard-coded colours. Desktop uses the
floating glass sidebar; phones get a glass top bar and tab bar with 44px touch targets. The printed invoice and the
signature pad stay white paper in both themes.

## Develop

```bash
pnpm --filter @miraflores/pms dev     # http://localhost:4874
```

Database changes go in `supabase/migrations/` (one SQL file per change, reviewed in a PR).

## Access

| Role | Can |
| --- | --- |
| owner | everything, including users, villas and rooms |
| manager | reservations and guests |
| staff | read the calendar, update the cleaning tasks assigned to them |

To give someone access: create the user in Supabase (Authentication → Users → Add user), then add a
row in `profiles` with their user id and role.
