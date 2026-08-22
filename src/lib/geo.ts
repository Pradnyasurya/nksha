import type { Place } from "@/db/schema";

export interface LatLng {
  lat: number;
  lng: number;
}

export const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface Ring {
  /** Closed or open ring of vertices; closure is assumed for containment. */
  points: LatLng[];
}

/** Winding-agnostic ray-casting point-in-ring test (planar approximation). */
export function pointInRing(point: LatLng, ring: Ring): boolean {
  let inside = false;
  const pts = ring.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng;
    const yi = pts[i].lat;
    const xj = pts[j].lng;
    const yj = pts[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function bboxOf(ring: Ring): BBox {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of ring.points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function placeLatLng(place: Place): LatLng {
  return { lat: place.lat, lng: place.lng };
}
