import type { MovementMode } from "@/db/schema";

/**
 * Google Timeline activity types bucketed into the four dashboard modes
 * (#11). Unknown vehicle types read as transit; anything unrecognised is
 * `other` so distance is still counted, never dropped.
 */

const DRIVING = new Set([
  "IN_VEHICLE",
  "MOTORCYCLING",
  "MOTORCYCLE",
  "IN_PASSENGER_VEHICLE",
  "IN_ROAD_VEHICLE",
]);

const TRANSIT = new Set([
  "IN_BUS",
  "IN_SUBWAY",
  "IN_TRAIN",
  "IN_TRAM",
  "IN_TROLLEYBUS",
  "IN_FERRY",
  "IN_CABLECAR",
  "IN_FUNICULAR",
  "IN_GUIDED_VEHICLE",
  "IN_RAIL_VEHICLE",
  "FLYING",
  "AIR_OR_HELICOPTER",
]);

const WALKING = new Set(["WALKING", "ON_FOOT", "HIKING", "RUNNING"]);

const CYCLING = new Set(["CYCLING", "ON_BICYCLE", "BICYCLING"]);

/** Normalize one raw activity type; null means "no usable mode". */
export function normalizeActivityType(raw: unknown): MovementMode | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toUpperCase().replaceAll(" ", "_");
  if (key.length === 0) return null;
  if (DRIVING.has(key)) return "driving";
  if (TRANSIT.has(key)) return "transit";
  if (WALKING.has(key)) return "walking";
  if (CYCLING.has(key)) return "cycling";
  if (
    key === "OTHER" ||
    key === "UNKNOWN" ||
    key === "NONE" ||
    key === "AWAY_FROM_DEVICE" ||
    key === "STILL"
  ) {
    return null;
  }
  return "other";
}

export const MODE_LABELS: Record<MovementMode, string> = {
  driving: "Driving",
  walking: "Walking",
  cycling: "Cycling",
  transit: "Transit",
  other: "Other",
};

/** Dashboard ordering: the four named modes first, then Other. */
export const MODE_ORDER: MovementMode[] = [
  "driving",
  "walking",
  "cycling",
  "transit",
  "other",
];
