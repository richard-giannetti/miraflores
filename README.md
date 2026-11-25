# Miraflores

Monorepo for **Miraflores — Villa Los Olivos & Villa La Playa (Calahonda)**, two holiday rentals on the Costa Tropical, Spain.

| Path | What | Status |
|---|---|---|
| `apps/web` | Public website (replaces the WordPress site at miraflorescostatropical.com). Static, SEO-first. | Step 1 — built, not deployed yet |
| `apps/pms` | Property management system for the owners: calendar, bookings, guests, cleaning, payments. | Step 2 — not started |
| `packages/*` | Code shared by both apps (domain types, calendar sync, UI). Created only when a second app needs it. | — |
| `migration/` | One-off export of the old WordPress content and images. | Done (content), images on demand |
| `docs/` | Architecture, roadmap, SEO migration plan, decision records. | — |

Start with [docs/architecture.md](docs/architecture.md) and [docs/roadmap.md](docs/roadmap.md).

## Requirements

- Node 24 (`nvm use`)
- pnpm (`corepack enable`)

## Common commands

```bash
pnpm wp:export        # re-pull pages, posts, SEO metadata from WordPress
pnpm wp:export:media  # also download all original images (~72 MB, not committed)
```
