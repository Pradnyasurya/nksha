# Contributing to nksha

Thanks for helping build nksha. This project handles maximally sensitive data
(location history), so a few rules are stricter than usual. Please read them before
your first pull request.

## Ground rules

- All changes land via **pull request to `main`**. No direct pushes; branch
  protection enforces this, including for admins.
- CI must pass (lint, typecheck, tests, build, privacy egress scan).
- Every commit must be signed off for the **Developer Certificate of Origin**
  (`git commit -s`). This certifies that you wrote the change or have the right to
  submit it, and gives us a clean provenance chain.

## Commit style

Short imperative summary line, ≤ 72 characters, e.g. `Add streaming parser for
Records.json`. Reference issues as `(#12)` when relevant.

## Pull requests

- Keep PRs small and focused; one logical change per PR.
- Fill in the PR template completely.
- Link the issue the PR resolves.

### AI-assisted contributions

Code written with AI assistance is welcome, but **you own it**: review every line
as if you wrote it, because you are certifying it with your DCO sign-off. Disclose
AI assistance in the PR template. Maintainers apply the same bar: every merge is a
human-reviewed decision, never an automated one.

## Hard constraints (CI-enforced)

1. **Zero network egress.** Shipped code must contain no absolute external network
   endpoints. See `docs/adr/0002-zero-network-egress.md`. Exceptions require an ADR
   and an entry in `scripts/egress-allowlist.txt`.
2. **No new dependencies without justification.** Every dependency is supply-chain
   risk for users' browsers. In the PR, state what problem it solves and why a
   platform API can't. Prefer zero-dependency solutions.
3. **Never commit secrets**, even in tests or fixtures. Use obviously-fake values
   like `DEADBEEF`.

## Local checks before pushing

```sh
npm run lint
npm run typecheck
npm test
npm run build
bash scripts/check-no-egress.sh
```

## Reporting bugs

Use the bug report template. **Never paste real timeline exports, real place names,
or real coordinates into issues** — issues are public and indexed.

## Licensing

By contributing, you agree your contributions are licensed under the Apache-2.0
license of this repository.
