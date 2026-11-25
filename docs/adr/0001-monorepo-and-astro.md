# ADR 0001 — Monorepo, Astro for the website

**Status:** accepted · 2026-11-25

## Context

The WordPress site (Elementor + Yoast) works but is slow, plugin-heavy and hard to evolve
into a booking site. We also plan an owner management system and, later, direct bookings.

## Decision

- One GitHub repo, pnpm workspaces: `apps/web`, `apps/pms`, `packages/*`.
- Rebuild the website in Astro as a static site, content in Markdown, deployed to a CDN.
- Pull existing content through the public WordPress REST API rather than a plugin or
  database dump (no credentials or plugin installs needed).

## Consequences

- Content edits happen in the repo (or later through a lightweight CMS / the PMS).
- Website and PMS can share types and calendar code without publishing packages.
- The Hostalia hosting plan stays: it includes the domain and the email (see `docs/domain-switch.md`).
