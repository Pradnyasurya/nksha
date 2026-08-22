# nksha

Turn your own Google Maps Timeline export into a visual record of your travels —
animated map playback, dashboards, and heatmaps.

> **Status:** pre-release, under active development. Not ready for daily use yet.

## Privacy

Your location history is maximally sensitive data, so nksha has one
non-negotiable invariant:

**Everything runs in your browser. Your timeline data never leaves your device.**

There is no account system, no upload endpoint, and no telemetry. This isn't just
a claim — it's enforced in CI (`scripts/check-no-egress.sh`) and recorded in
[ADR-0002](docs/adr/0002-zero-network-egress.md). You can verify it yourself:
the app is statically hostable, so run your own copy and watch the network tab.

## How it works

1. Export your Timeline from Google ([Takeout](https://takeout.google.com/) → Maps).
2. Import the export file into nksha. Parsing happens entirely client-side.
3. Your visits, places, and trips live in local browser storage; export backups
   anytime as versioned JSON.

## Development

Requirements: Node.js 24+.

```sh
npm install
npm run dev        # once the app scaffold lands
npm test
```

This project is built agent-first but human-governed: AI agents write code, humans
review and merge every change. See [AGENTS.md](AGENTS.md) for agent rules,
[CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process, and
[docs/adr/](docs/adr/) for architecture decisions.

## Security

Please report vulnerabilities privately via GitHub's *Report a vulnerability*
button rather than opening an issue. See [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
