import type { BBox, LatLng } from "@/lib/geo";
import { pointInRing, type Ring } from "@/lib/geo";
import type { CountryPoly } from "./polygons";

/**
 * Country matching for the dashboard (#11): point-in-polygon first, then a
 * coastal snap to the nearest country within ~50 km. Visits farther than
 * that fall in the ocean and stay uncounted — honest about data gaps.
 */

export const COASTAL_SNAP_RADIUS_M = 50_000;

const M_PER_DEGREE_LAT = 111_320;

/** Even-odd parity across every ring; holes flip parity back out. */
function insideCountry(point: LatLng, poly: CountryPoly): boolean {
  let crossings = 0;
  for (const ring of poly.rings) {
    if (pointInRing(point, ring)) crossings++;
  }
  return crossings % 2 === 1;
}

function distanceToRing(point: LatLng, ring: Ring): number {
  let best = Infinity;
  const pts = ring.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    best = Math.min(best, metersToSegment(point, pts[j], pts[i]));
    if (best === 0) return 0;
  }
  return best;
}

function metersToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  // Work in local metre space around the point's latitude.
  const scaleLng = M_PER_DEGREE_LAT * Math.cos((p.lat * Math.PI) / 180);
  const px = p.lng * scaleLng;
  const py = p.lat * M_PER_DEGREE_LAT;
  const ax = a.lng * scaleLng;
  const ay = a.lat * M_PER_DEGREE_LAT;
  const bx = b.lng * scaleLng;
  const by = b.lat * M_PER_DEGREE_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToCountry(point: LatLng, poly: CountryPoly): number {
  let best = Infinity;
  for (const ring of poly.rings) {
    best = Math.min(best, distanceToRing(point, ring));
    if (best === 0) return 0;
  }
  return best;
}

function bboxExpanded(box: BBox, marginDegrees: number): BBox {
  return {
    minLat: box.minLat - marginDegrees,
    maxLat: box.maxLat + marginDegrees,
    minLng: box.minLng - marginDegrees,
    maxLng: box.maxLng + marginDegrees,
  };
}

/** Conservative degree margin so the prefilter never excludes a true snap. */
function snapMarginDegrees(snapRadiusMeters: number, point: LatLng): number {
  const cos = Math.max(
    0.1,
    Math.cos((Math.abs(point.lat) * Math.PI) / 180),
  );
  return snapRadiusMeters / M_PER_DEGREE_LAT / cos;
}

function bboxContains(box: BBox, point: LatLng): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng
  );
}

/**
 * Resolve one coordinate to an ISO A3 code: inside → that country;
 * within `snapRadiusM` of the nearest coast → snapped there; else null.
 */
export function matchCountry(
  point: LatLng,
  countries: CountryPoly[],
  snapRadiusM: number = COASTAL_SNAP_RADIUS_M,
): string | null {
  for (const poly of countries) {
    if (!bboxContains(poly.bbox, point)) continue;
    if (insideCountry(point, poly)) return poly.iso;
  }

  const margin = snapMarginDegrees(snapRadiusM, point);
  let bestIso: string | null = null;
  let bestDistance = snapRadiusM;
  for (const poly of countries) {
    if (!bboxContains(bboxExpanded(poly.bbox, margin), point)) continue;
    const distance = distanceToCountry(point, poly);
    if (
      distance <= bestDistance &&
      (distance < bestDistance || bestIso === null)
    ) {
      bestDistance = distance;
      bestIso = poly.iso;
    }
  }
  return bestIso;
}

/** Batch form used by the worker and tests. */
export function matchCountries(
  places: Array<{ id: string; lat: number; lng: number }>,
  countries: CountryPoly[],
  snapRadiusM: number = COASTAL_SNAP_RADIUS_M,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const place of places) {
    out[place.id] = matchCountry(
      { lat: place.lat, lng: place.lng },
      countries,
      snapRadiusM,
    );
  }
  return out;
}
