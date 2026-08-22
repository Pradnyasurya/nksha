import type { Place, Visit } from "@/db/schema";

/**
 * Dwell weighting for the heatmap (#10). Hours lived somewhere, not GPS
 * ping counts. Dwell is aggregated per place per year once; any slider
 * selection then sums precomputed slices, so recomputes stay smooth even
 * over multi-thousand-visit ranges.
 */

export interface YearlyDwellIndex {
  /** Sorted distinct years with any visit data (may be empty). */
  years: number[];
  minYear: number | null;
  maxYear: number | null;
  rows: Array<{
    place: Place;
    /** Dwell milliseconds aligned to `years`; null when the place has none. */
    dwellPerYearMs: Float64Array;
    totalDwellMs: number;
  }>;
}

export interface WeightedPlace {
  place: Place;
  dwellMs: number;
}

export function buildDwellIndex(
  visits: Visit[],
  places: Place[],
  clampEndMs: number = Date.now(),
): YearlyDwellIndex {
  const placesById = new Map(places.map((p) => [p.id, p]));
  const years = new Set<number>();
  const partial = new Map<string, Map<number, number>>();

  for (const visit of visits) {
    if (!placesById.has(visit.placeId)) continue;
    const startMs = visit.startTimeMs;
    if (!Number.isFinite(startMs)) continue;
    const endMs = Math.min(visit.endTimeMs ?? clampEndMs, clampEndMs);
    const dwellMs = Math.max(0, endMs - startMs);
    if (dwellMs === 0) continue;

    const year = new Date(startMs).getFullYear();
    years.add(year);
    const perYear = partial.get(visit.placeId) ?? new Map<number, number>();
    perYear.set(year, (perYear.get(year) ?? 0) + dwellMs);
    partial.set(visit.placeId, perYear);
  }

  const sortedYears = [...years].sort((a, b) => a - b);
  const yearIndex = new Map(sortedYears.map((y, i) => [y, i]));
  const size = Math.max(1, sortedYears.length);

  const rows = [...partial.entries()].map(([placeId, perYear]) => {
    const dwellPerYearMs = new Float64Array(size);
    let totalDwellMs = 0;
    for (const [year, dwell] of perYear) {
      dwellPerYearMs[yearIndex.get(year)!] = dwell;
      totalDwellMs += dwell;
    }
    return { place: placesById.get(placeId)!, dwellPerYearMs, totalDwellMs };
  });

  return {
    years: sortedYears,
    minYear: sortedYears.length > 0 ? sortedYears[0] : null,
    maxYear: sortedYears.length > 0 ? sortedYears[sortedYears.length - 1] : null,
    rows,
  };
}

/** Sum each place's dwell across the inclusive year window. */
export function sumRange(
  index: YearlyDwellIndex,
  fromYear: number,
  toYear: number,
): WeightedPlace[] {
  if (index.years.length === 0) return [];
  const lo = index.years.findIndex((y) => y >= fromYear);
  let hi = -1;
  for (let i = index.years.length - 1; i >= 0; i--) {
    if (index.years[i] <= toYear) {
      hi = i;
      break;
    }
  }
  if (lo === -1 || hi === -1 || lo > hi) return [];

  const out: WeightedPlace[] = [];
  for (const row of index.rows) {
    let dwellMs = 0;
    for (let i = lo; i <= hi; i++) dwellMs += row.dwellPerYearMs[i];
    if (dwellMs > 0) out.push({ place: row.place, dwellMs });
  }
  return out.sort((a, b) => b.dwellMs - a.dwellMs);
}
