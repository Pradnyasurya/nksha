<!--
Thank you for contributing! Please keep this PR small and focused.
Never paste real location data, place names, or coordinates anywhere in this PR.
-->

## Summary

<!-- What does this PR do, in 1–3 sentences? -->

Resolves #<!-- issue number -->

## Changes

<!-- Bullet list of the meaningful changes. -->

## How was this tested?

<!-- CI is necessary but not sufficient. Describe manual verification. -->

## Checklist

- [ ] Every commit is DCO-signed (`git commit -s`).
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass locally.
- [ ] **Privacy:** no new runtime network calls (see ADR-0002). If any external
      endpoint was added, an ADR justifies it and it is allowlisted in
      `scripts/egress-allowlist.txt`.
- [ ] Any new dependency has a stated justification in this PR.
- [ ] No secrets committed; test fixtures use obviously-fake values.
- [ ] AI-assisted code (if any) was fully reviewed by me, line by line.
