# 0001 — Client-side parsing, local-first storage

Date: 2026-08-22
Status: Accepted

## Context

Users must import their own Google Maps Timeline exports (JSON files) for the app to work. Location history is maximally sensitive personal data. The alternative designs were:

1. **Server-side parsing + storage** — users upload raw timeline JSON; the server parses and stores visits in Postgres. Enables cross-device sync and rich queries, but makes the operator custodian of other people's location histories (breach liability, trust barrier, legal exposure).
2. **Client-side parsing, local-first storage** — the browser parses the uploaded JSON; parsed data lives in browser storage (IndexedDB). The server (if any) never sees raw location data.

## Decision

Parse imports entirely client-side and store parsed data locally in the browser (IndexedDB). No raw location data ever reaches a server. Accounts/auth are deferred until a concrete need (e.g., encrypted sync) exists; the deployment story is a statically-hostable app anyone can run ("BYO instance").

## Consequences

- No import/upload API surface exists; the backend is reduced to static file hosting (for now).
- Data is device-bound: clearing browser storage loses the diary unless the user exports a backup (JSON export/import becomes a first-class feature).
- Cross-device sync, sharing, and server-side dashboards require future work (likely encrypted-blob sync with client-held keys); schema should tag data with an import/source id to make later reconciliation possible.
- Very large exports (Records.json can be hundreds of MB) must be parsed with streaming/incremental techniques in the browser to avoid UI freezes.
