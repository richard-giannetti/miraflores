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
- **Invoices** (Wave 2, owners and managers): draft from a reservation in one click, edit customer and lines
  (enter prices with or without VAT), issue. Issuing numbers the invoice in its series with no gaps
  (`F2026-0001`, `S…` simplified, `R…` corrective), dates it today, freezes the company details and locks it;
  corrections go through a corrective invoice. Printable bilingual (ES/EN) invoice, save as PDF from the browser.
  Company details (NIF, address, default VAT) under "Company details" (owners).
  **Not yet VeriFactu-signed**: from 2027 a certified service must sign them (see docs/pms/features.md, module 9).

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
