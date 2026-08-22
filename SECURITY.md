# Security Policy

nksha handles location history — data that can reveal a person's home,
routines, and relationships. We treat security reports with corresponding urgency.

## Supported versions

The project is pre-release; only the latest `main` branch is supported.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository, or email the address
listed in the repository's security advisories once one exists.

Please include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected code paths, if known.

We aim to acknowledge reports within 7 days and will keep you informed as we
work on a fix. There is no formal SLA while the project is pre-release.

### Safe harbor

We consider security research conducted in good faith and in accordance with this
policy to be authorized. We will not pursue legal action against anyone who:

- Reports vulnerabilities privately and gives us reasonable time to fix them
  before public disclosure,
- Avoids privacy violations, degradation of service, and destructive actions,
- Only interacts with systems they own or have explicit permission to test.

## Scope

### In scope

- **Parsing of imported files.** Timeline exports are untrusted input: an attacker
  can craft a malicious JSON file and trick a user into importing it. Prototype
  pollution, XSS via parsed values, memory exhaustion, and similar parser attacks
  are all in scope.
- **Bypassing the zero-egress invariant.** Any path by which user data leaves the
  browser without explicit user action is a critical vulnerability.
- **Backup/export integrity.** The JSON archive format must not become a vector
  for injecting forged history entries.
- **Dependency compromise** affecting shipped code.

### Out of scope

- A compromised user device or browser.
- Users sharing their own exported data voluntarily.
- Vulnerabilities in third-party hosting providers ("BYO instance" deployments).
