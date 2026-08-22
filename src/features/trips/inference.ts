import type { DismissedTripRange, Place, Trip, Visit } from "@/db/schema";
import { coveredDayKeys } from "@/features/dashboard/stats";
import { haversineMeters } from "@/lib/geo";
import { addDays } from "@/lib/days";

/** "Far outside the Home region" means farther than this (#7). */
export const INFER_AWAY_RADIUS_M = 50_000;

export interface InferenceInput {
  visits: Visit[];
  places: Place[];
  homePlaceId: string | null;
  trips: Trip[];
  dismissedRanges: DismissedTripRange[];
}

export interface SuggestedTripWindow {
  startDay: string;
  endDay: string;
  name: string;
}

function awayDaysByDistance(
  visits: Visit[],
  places: Place[],
  homePlaceId: string,
): Map<string, { maxDistanceMeters: number; farthestVisitId: number | null }> {
  const placesById = new Map(places.map((p) => [p.id, p]));
  const home = placesById.get(homePlaceId);
  if (!home) return new Map();

  const days = new Map<
    string,
    { maxDistanceMeters: number; farthestVisitId: number | null }
  >();
  for (const visit of visits) {
    const place = placesById.get(visit.placeId);
    if (!place) continue;
    const distanceMeters = haversineMeters(
      { lat: home.lat, lng: home.lng },
      { lat: place.lat, lng: place.lng },
    );
    if (distanceMeters <= INFER_AWAY_RADIUS_M) continue;
    const end = Math.max(visit.endTimeMs ?? visit.startTimeMs, visit.startTimeMs);
    for (const key of coveredDayKeys(visit.startTimeMs, end)) {
      const entry = days.get(key);
      if (!entry || distanceMeters > entry.maxDistanceMeters) {
        days.set(key, { maxDistanceMeters: distanceMeters, farthestVisitId: visit.id ?? null });
      }
    }
  }
  return days;
}

function consecutiveRuns(sortedDays: string[]): [string, string][] {
  const runs: [string, string][] = [];
  let runStart: string | null = null;
  let previous: string | null = null;
  for (const day of sortedDays) {
    if (runStart === null) {
      runStart = day;
    } else if (previous !== null && addDays(previous, 1) !== day) {
      runs.push([runStart, previous]);
      runStart = day;
    }
    previous = day;
  }
  if (runStart !== null && previous !== null) {
    runs.push([runStart, previous]);
  }
  return runs;
}

function rangeIsDismissed(
  startDay: string,
  endDay: string,
  dismissedRanges: DismissedTripRange[],
): boolean {
  return dismissedRanges.some(
    (range) => startDay <= range.endDay && endDay >= range.startDay,
  );
}

/**
 * Deterministic import-time clustering away from Home. Windows span the
 * first away-day through the last, so travel days bookend every trip.
 */
export function inferTripWindows(input: InferenceInput): SuggestedTripWindow[] {
  const { visits, places, homePlaceId, trips, dismissedRanges } = input;
  if (!homePlaceId) return [];

  const awayDays = awayDaysByDistance(visits, places, homePlaceId);
  if (awayDays.size === 0) return [];

  const placesById = new Map(places.map((p) => [p.id, p]));
  const visitsById = new Map(
    visits.filter((v) => v.id !== undefined).map((v) => [v.id as number, v]),
  );

  const suggestions: SuggestedTripWindow[] = [];
  for (const [candidateStart, candidateEnd] of consecutiveRuns(
    [...awayDays.keys()].sort(),
  )) {
    if (rangeIsDismissed(candidateStart, candidateEnd, dismissedRanges)) {
      continue;
    }
    for (const [startDay, endDay] of subtractWindows(
      candidateStart,
      candidateEnd,
      trips,
    )) {
      const name = suggestNameForWindow(
        startDay,
        endDay,
        awayDays,
        visitsById,
        placesById,
      );
      suggestions.push({ startDay, endDay, name });
    }
  }
  return suggestions;
}

/**
 * Cut `[startDay, endDay]` into the pieces that fall outside every given
 * trip window. Declared commitments trim candidates instead of rejecting
 * them wholesale.
 */
export function subtractWindows(
  startDay: string,
  endDay: string,
  blockers: Trip[],
): [string, string][] {
  const pieces: [string, string][] = [];
  let cursor = startDay;
  const relevant = [...blockers]
    .filter((t) => t.startDay <= endDay && t.endDay >= startDay)
    .sort((a, b) => a.startDay.localeCompare(b.startDay));
  for (const blocker of relevant) {
    if (blocker.startDay > cursor) {
      pieces.push([cursor, addDays(blocker.startDay, -1)]);
    }
    const afterBlocker = addDays(blocker.endDay, 1);
    if (afterBlocker > cursor) cursor = afterBlocker;
  }
  if (cursor <= endDay) {
    pieces.push([cursor, endDay]);
  }
  return pieces.filter(([s, e]) => s <= e);
}

function suggestNameForWindow(
  startDay: string,
  endDay: string,
  awayDays: Map<string, { maxDistanceMeters: number; farthestVisitId: number | null }>,
  visitsById: Map<number, Visit>,
  placesById: Map<string, Place>,
): string {
  let best: { distance: number; name: string | null } | null = null;
  for (const [dayKeyStr, entry] of awayDays) {
    if (dayKeyStr < startDay || dayKeyStr > endDay) continue;
    if (best === null || entry.maxDistanceMeters > best.distance) {
      best = { distance: entry.maxDistanceMeters, name: null };
      const visit =
        entry.farthestVisitId !== null
          ? visitsById.get(entry.farthestVisitId)
          : undefined;
      const placeName = visit ? placesById.get(visit.placeId)?.name : undefined;
      best.name = placeName && placeName.length > 0 ? placeName : null;
    }
  }
  const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  const range = `${fmt.format(new Date(dayKeyToDateSafe(startDay)))}–${fmt.format(new Date(dayKeyToDateSafe(endDay)))}`;
  const destination = best?.name;
  return destination
    ? `${destination}, ${range}`
    : `Trip, ${range}`;
}

function dayKeyToDateSafe(key: string): string {
  return `${key}T00:00:00`;
}
