import type { Place, Visit } from "@/db/schema";
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
