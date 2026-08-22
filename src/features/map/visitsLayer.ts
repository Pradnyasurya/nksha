import type { Place, Visit } from "@/db/schema";

export interface VisitFeatureCollection {
  type: "FeatureCollection";
  features: VisitFeature[];
}

export interface VisitFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    visitId?: number;
    placeId: string;
    year: number;
    name: string;
    address: string;
    startTimeMs: number;
    endTimeMs: number | null;
    probability?: number;
  };
}

export function yearOf(visit: Visit): number {
  return new Date(visit.startTimeMs).getFullYear();
}

const GOLDEN_ANGLE = 137.508;

/** Stable per-year hue so every calendar year reads as one colour. */
export function yearColor(year: number): string {
  const hue = (((year * GOLDEN_ANGLE) % 360) + 360) % 360;
  return `hsl(${Math.round(hue * 100) / 100}, 65%, 55%)`;
}

/** Match-expression pairs for maplibre's circle-color, per distinct year. */
export function yearColorMatch(visits: Visit[]): [number, string][] {
  const years = [...new Set(visits.map(yearOf))].sort((a, b) => a - b);
  return years.map((y) => [y, yearColor(y)]);
}

export function placeIndex(places: Place[]): Map<string, Place> {
  return new Map(places.map((p) => [p.id, p]));
}

export function visitsToGeoJson(
  visits: Visit[],
  placesById: Map<string, Place>,
): VisitFeatureCollection {
  const features: VisitFeature[] = [];
  for (const visit of visits) {
    const place = placesById.get(visit.placeId);
    if (!place) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
      properties: {
        visitId: visit.id,
        placeId: visit.placeId,
        year: yearOf(visit),
        name: place.name,
        address: place.address,
        startTimeMs: visit.startTimeMs,
        endTimeMs: visit.endTimeMs,
        ...(visit.sourceProbability !== undefined
          ? { probability: visit.sourceProbability }
          : {}),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatVisitWindow(
  startTimeMs: number,
  endTimeMs: number | null,
): string {
  const arrival = DATE_FORMAT.format(new Date(startTimeMs));
  if (endTimeMs === null) {
    return `${arrival} · still here`;
  }
  return `${arrival} – ${DATE_FORMAT.format(new Date(endTimeMs))}`;
}
