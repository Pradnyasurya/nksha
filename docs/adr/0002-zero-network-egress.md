# 0002 — Zero network egress from shipped code

Date: 2026-08-22
Status: Accepted

## Context

ADR-0001 made nksha local-first: imports are parsed client-side and data
never reaches a server. But a claim is not a control. The app's core promise —
"your location history never leaves your device" — is exactly what auditors and
scrutinizers of an open source project will try to falsify. Two failure modes exist:

1. **Accidental egress** — a dependency, font, icon set, or analytics snippet that
   quietly phones home; common in web apps and invisible to users.
2. **Deliberate exceptions** — future features (map tiles, sync) that introduce
   endpoints without an honest, reviewable decision.

The known tension: animated map playback implies map tiles, and tile servers
observe every requested viewport (which reveals where the user is looking).
This is a real design question that deserves its own decision (a future ADR);
until then, the app ships without online tiles.

## Decision

Shipped browser-facing code (`src/`, `public/`, `index.html`) must contain no
absolute network endpoints (`http(s)://`, `ws(s)://`). This invariant is enforced,
not aspirational:

- `scripts/check-no-egress.sh` scans sources on every CI run and fails the build.
- Deliberate exceptions require: (1) an ADR recording the decision and its
  privacy cost, then (2) a regex entry in `scripts/egress-allowlist.txt`
  referencing that ADR. The allowlist is reviewed like code.

Assets (fonts, icons, images) are bundled locally; no CDNs. No analytics or
telemetry of any kind.

## Consequences

- Every runtime dependency is scanned by the same gate, so transitive URLs in
  bundled output surface at build time rather than in production.
- Reverse-engineerability is a feature: anyone can run their own copy of the
  static build and confirm the absence of outbound requests in the network tab.
- Future sync (encrypted blobs to user-chosen storage) and online map tiles each
  need their own ADR; both will be the first entries in the allowlist.
- Contributors occasionally hit false positives (e.g., documentation links in
  comments); the fix is rewording or allowlisting with justification, keeping
  the signal loud.
