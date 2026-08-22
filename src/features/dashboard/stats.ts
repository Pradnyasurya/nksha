import type { Movement, MovementMode, Place, Visit } from "@/db/schema";
import { MODE_ORDER } from "@/features/movement/modes";
import { haversineMeters } from "@/lib/geo";
import { dayKey, eachDay } from "@/lib/days";

export interface DaysAwayOptions {
  /** Bound for open-ended stays; defaults to the visit's own start (no cost). */
  clampEndMs?: number;
}

function effectiveEnd(visit: Visit, clampEndMs?: number): number {
  const raw = visit.endTimeMs ?? clampEndMs ?? visit.startTimeMs;
  return Math.max(raw, visit.startTimeMs);
}

export function coveredDayKeys(startMs: number, endMs: number): string[] {
  return eachDay(dayKey(startMs), dayKey(endMs));
}

/**
 * Distinct local calendar days overlapping any non-Home visit. Touching a
 * day boundary counts; overlapping away stays never double-count.
 */
export function daysAwayFromHome(
  visits: Visit[],
  homePlaceId: string,
  options: DaysAwayOptions = {},
): number {
  const days = new Set<string>();
  for (const visit of visits) {
    if (visit.placeId === homePlaceId) continue;
    for (const key of coveredDayKeys(
      visit.startTimeMs,
      effectiveEnd(visit, options.clampEndMs),
    )) {
      days.add(key);
    }
  }
  return days.size;
}

export interface DwellRanking {
  place: Place;
  totalDwellMs: number;
  visitCount: number;
}

/** Duration-weighted top places — dwell time, not visit count (#5). */
export function topPlacesByDwell(
  visits: Visit[],
  places: Place[],
  n = 5,
  clampEndMs: number = Date.now(),
): DwellRanking[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const totals = new Map<string, { total: number; count: number }>();
  for (const visit of visits) {
    if (!byId.has(visit.placeId)) continue;
    const dwell = Math.max(
      0,
      effectiveEnd(visit, clampEndMs) - visit.startTimeMs,
    );
    const entry = totals.get(visit.placeId) ?? { total: 0, count: 0 };
    entry.total += dwell;
    entry.count += 1;
    totals.set(visit.placeId, entry);
  }
  return [...totals.entries()]
    .map(([id, { total, count }]) => ({
      place: byId.get(id)!,
      totalDwellMs: total,
      visitCount: count,
    }))
    .sort((a, b) => b.totalDwellMs - a.totalDwellMs)
    .slice(0, n);
}

/** Twelve cells: distinct visited local days per month of `year`. */
export function monthStripDensity(visits: Visit[], year: number): number[] {
  const perMonth = new Array<number>(12).fill(0);
  const seenPerMonth = Array.from({ length: 12 }, () => new Set<string>());
  for (const visit of visits) {
    for (const key of coveredDayKeys(
      visit.startTimeMs,
      effectiveEnd(visit),
    )) {
      if (Number(key.slice(0, 4)) !== year) continue;
      const monthIndex = Number(key.slice(5, 7)) - 1;
      seenPerMonth[monthIndex].add(key);
    }
  }
  for (let m = 0; m < 12; m++) perMonth[m] = seenPerMonth[m].size;
  return perMonth;
}

/** Visits whose span overlaps the month window (`YYYY-MM`). */
export function visitsInMonth(
  visits: Visit[],
  monthKey: string,
  options: DaysAwayOptions = {},
): Visit[] {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return [];
  const start = new Date(y, m - 1, 1).getTime();
  const end = new Date(y, m, 1).getTime();
  return visits.filter(
    (v) =>
      v.startTimeMs < end &&
      effectiveEnd(v, options.clampEndMs ?? Number.MAX_SAFE_INTEGER) >= start,
  );
}

export function availableYears(visits: Visit[]): number[] {
  return [...new Set(visits.map((v) => new Date(v.startTimeMs).getFullYear()))]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Dashboard completion (#11)
// ---------------------------------------------------------------------------

export interface ModeDistance {
  mode: MovementMode;
  distanceMeters: number;
  movementCount: number;
}

/** Distance summed per mode from imported activity segments. */
export function distanceByMode(movements: Movement[]): ModeDistance[] {
  const totals = new Map<MovementMode, { meters: number; count: number }>();
  for (const movement of movements) {
    if (!Number.isFinite(movement.distanceMeters)) continue;
    const entry = totals.get(movement.mode) ?? { meters: 0, count: 0 };
    entry.meters += Math.max(0, movement.distanceMeters);
    entry.count += 1;
    totals.set(movement.mode, entry);
  }
  return MODE_ORDER.filter((mode) => totals.has(mode)).map((mode) => {
    const entry = totals.get(mode)!;
    return { mode, distanceMeters: entry.meters, movementCount: entry.count };
  });
}

export interface FarthestPlace {
  place: Place;
  distanceMeters: number;
}

/**
 * The farthest Place with at least one Visit from the declared Home —
 * the one-line delight card (#11). null without Home or any away visits.
 */
export function farthestPlaceFromHome(
  visits: Visit[],
  places: Place[],
  homePlaceId: string,
): FarthestPlace | null {
  const home = places.find((p) => p.id === homePlaceId);
  if (!home) return null;
  const visitedIds = new Set(visits.map((v) => v.placeId));

  let best: FarthestPlace | null = null;
  for (const place of places) {
    if (place.id === homePlaceId || !visitedIds.has(place.id)) continue;
    const distanceMeters = haversineMeters(
      { lat: home.lat, lng: home.lng },
      { lat: place.lat, lng: place.lng },
    );
    if (
      best === null ||
      distanceMeters > best.distanceMeters ||
      (distanceMeters === best.distanceMeters && place.name < best.place.name)
    ) {
      best = { place, distanceMeters };
    }
  }
  return best;
}
