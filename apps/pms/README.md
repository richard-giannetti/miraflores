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
| staff | read the calendar |

To give someone access: create the user in Supabase (Authentication → Users → Add user), then add a
row in `profiles` with their user id and role.
