#!/usr/bin/env node
/**
 * Build the bundled low-res country polygon asset for #11.
 *
 * Input:  Natural-Earth-derived countries GeoJSON (johan/world.geo.json,
 *         public domain-ish MIT) fetched once at authoring time.
 * Output: src/assets/countries.json — compact `[isoA3, name, rings]` rows
 *         with coordinates rounded to 2 decimals (~1 km). The app never
 *         fetches this at runtime (ADR-0002 zero egress); it is committed
 *         and lazy-imported so it stays out of the main bundle.
 *
 * Usage: node scripts/build-countries.mjs <countries.geo.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-countries.mjs <countries.geo.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const round = (n) => Math.round(n * 100) / 100;

const out = [];
for (const feature of raw.features) {
  const geometry = feature.geometry;
  if (!geometry) continue;
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  const rings = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const compactRing = [];
      let prevLng = NaN;
      let prevLat = NaN;
      for (const [lng, lat] of ring) {
        const rLng = round(lng);
        const rLat = round(lat);
        // Drop points that collapse onto their predecessor after rounding.
        if (rLng === prevLng && rLat === prevLat) continue;
        compactRing.push([rLng, rLat]);
        prevLng = rLng;
        prevLat = rLat;
      }
      if (compactRing.length >= 4) rings.push(compactRing);
    }
  }
  if (rings.length === 0) continue;
  out.push([feature.id, feature.properties?.name ?? feature.id, rings]);
}

out.sort((a, b) => a[0].localeCompare(b[0]));

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/assets");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "countries.json");
writeFileSync(outPath, JSON.stringify(out));

const kb = (JSON.stringify(out).length / 1024).toFixed(0);
console.log(`Wrote ${out.length} countries (${kb} KB minified) → ${outPath}`);
