#!/usr/bin/env bash
# Bundle-size budget (#bundle-budget).
#
# Fails CI when the initial JavaScript payload (everything a first paint
# downloads: the entry chunk plus its static shared chunks, CSS excluded from
# the JS budget but reported) exceeds 200 KB gzipped. Heavy dependencies
# (MapLibre, mp4-muxer, country polygons, workers) are lazy chunks and are
# checked only against the per-chunk budget below.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

if [[ ! -d "$DIST" ]]; then
  echo "bundle-budget: dist/ missing — run 'npm run build' first." >&2
  exit 1
fi

INITIAL_BUDGET_KB=200
# MapLibre is huge by nature; the budget exists to catch accidental
# regressions (e.g. it leaking into the entry chunk), not to cap the library.
LAZY_CHUNK_BUDGET_KB=300

total_gz=0
echo "gzip sizes:"
for file in "$DIST"/assets/*.js; do
  gz=$(gzip -c "$file" | wc -c)
  kb=$((gz / 1024))
  name="$(basename "$file")"
  echo "  $name ${kb} KB"
  # The entry chunk is index-*.js; everything it statically imports lands in
  # index/jsx-runtime/shared helpers. MapLibre, videoExport, workers and
  # polygons are dynamically imported and excluded from the initial payload.
  case "$name" in
    maplibre-gl-*|videoExport-*|countries-*|countries.worker-*|import.worker-*|polygons-*)
      if (( kb > LAZY_CHUNK_BUDGET_KB )); then
        echo "bundle-budget: lazy chunk $name is ${kb} KB gzip (budget ${LAZY_CHUNK_BUDGET_KB} KB)." >&2
        exit 1
      fi
      ;;
    *)
      total_gz=$((total_gz + gz))
      ;;
  esac
done

total_kb=$((total_gz / 1024))
echo "  initial JS payload: ${total_kb} KB gzip (budget ${INITIAL_BUDGET_KB} KB)"
if (( total_kb > INITIAL_BUDGET_KB )); then
  echo "bundle-budget: initial JS payload ${total_kb} KB gzip exceeds the ${INITIAL_BUDGET_KB} KB budget." >&2
  exit 1
fi
echo "bundle-budget: OK"
