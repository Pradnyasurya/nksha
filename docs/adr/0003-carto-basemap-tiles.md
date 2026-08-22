# 0003 — Carto basemap tiles and user-supplied style URLs

Date: 2026-08-22
Status: Accepted

## Context

ADR-0002 forbids network endpoints in shipped code. A map product, however,
needs basemap imagery. Bundling worldwide raster tiles is impractical (tens of
gigabytes), so the living map (#2) cannot render without requesting tiles from
a third-party provider. Separately, users may want their own MapLibre style
(such as self-hosted or premium vector styles), which requires fetching a
user-configured style document at runtime.

## Decision

Two narrow exceptions to the zero-egress invariant:

1. **Carto raster basemap tiles** are the built-in default (`dark_all` /
   `light_all` on `basemaps.cartocdn.com`). These are the only hardcoded
   endpoints in shipped code.
2. **User-supplied MapLibre style URLs** from Settings are fetched client-side
   when explicitly configured. The URL is user-initiated configuration, not an
   embedded endpoint; the app validates the response shape before applying it
   and falls back to the default on any failure.

No other network calls exist. Raw timeline data is never sent anywhere: tile
requests carry only viewport parameters (zoom/x/y), never user data.

## Consequences

- The egress scan (`scripts/check-no-egress.sh`) allowlists exactly one file
  pattern for the Carto tile URLs, citing this ADR.
- Users can verify the posture in their browser network tab: only tile/style
  requests appear.
- If Carto terms or availability change, swapping providers means editing one
  module (`src/features/map/mapStyles.ts`) plus this ADR.
