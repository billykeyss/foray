# components/ — UI conventions

Presentational React components. Loaded in addition to the root `CLAUDE.md`.

## Components are presentational; pages own the data

Components here **do not import `PNW_CATALOG`** or other catalog modules — pages (`app/**`) read the data (that's what feeds `generateStaticParams` for the static export) and pass it down as props. Keep new components prop-driven; don't reach into the catalog from a component.

## Styling: a bespoke field-notebook palette via CSS variables

There is **no Tailwind design-token soup here** — most styling is inline `style={{}}` referencing CSS custom properties defined in `app/globals.css`. Use those variables instead of hardcoded colors: `--ink`, `--ink-soft`, `--moss` / `--moss-mid` / `--moss-soft`, `--parchment` / `--parchment-deep`, `--rain`, `--rust`, `--cap`, `--line` / `--line-soft`. (A parallel set of shadcn-style tokens — `--background`, `--foreground`, `--primary`, etc. — also exists for the Radix/`ui/` primitives; prefer the naturalist palette for app UI.)

Type uses `font-display` (Fraunces), `font-body` (Inter), `font-mono` (IBM Plex Mono), wired as CSS variables in `app/layout.tsx` and applied via the `font-display` / `font-body` / `font-mono` utility classes.

## Only two button classes exist

`.btn-primary` and `.btn-ghost` — **that's it.** There is no `.btn-secondary` (reaching for it is a known trap; it renders unstyled). Check `app/globals.css` before using any `btn-*` class.

## Client vs static-export constraints

- Interactive components are `"use client"`.
- Leaflet has no SSR; the map is loaded via `next/dynamic` with `ssr: false` (required under `output: 'export'`). Follow that pattern for any browser-only library.
- Primitives come from Radix (`@radix-ui/*`) and icons from `lucide-react` / `@radix-ui/react-icons`.
