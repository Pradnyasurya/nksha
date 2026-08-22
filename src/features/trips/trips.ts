import type { Trip, Visit } from "@/db/schema";
import { coveredDayKeys } from "@/features/dashboard/stats";
import { isValidDayKey } from "@/lib/days";

/**
 * Membership is derived, never stored: any visit whose span touches the
 * window belongs to it (max one Trip per Visit is enforced on creation).
 */
export function visitsInTrip(
  visits: Visit[],
  startDay: string,
  endDay: string,
): Visit[] {
  return visits.filter((visit) => {
    const end = visit.endTimeMs ?? visit.startTimeMs;
    const keys = coveredDayKeys(visit.startTimeMs, Math.max(end, visit.startTimeMs));
    return (
      keys[0] <= endDay &&
      keys[keys.length - 1] >= startDay
    );
  });
}

export function findOverlappingTrip(
  trips: Trip[],
  startDay: string,
  endDay: string,
  ignoreId?: string,
): Trip | undefined {
  return trips.find(
    (trip) =>
      trip.id !== ignoreId && startDay <= trip.endDay && endDay >= trip.startDay,
  );
}

export function overlapsAnyTrip(
  trips: Trip[],
  startDay: string,
  endDay: string,
  ignoreId?: string,
): boolean {
  return findOverlappingTrip(trips, startDay, endDay, ignoreId) !== undefined;
}

export function assertValidTripWindow(startDay: string, endDay: string): void {
  if (!isValidDayKey(startDay) || !isValidDayKey(endDay)) {
    throw new Error("Trip window needs valid dates");
  }
  if (startDay > endDay) {
    throw new Error("The trip cannot end before it starts");
  }
}

/** Default name when the user does not provide one. */
export function suggestTripName(startDay: string, endDay: string): string {
  const fmt = (key: string) =>
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
      new Date(key + "T00:00:00"),
    );
  if (startDay === endDay) return `Trip, ${fmt(startDay)}`;
  return `Trip, ${fmt(startDay)}–${fmt(endDay)}`;
}
