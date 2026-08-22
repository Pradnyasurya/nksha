import type { TimelinePoint } from "@/db/schema";

export interface ParsedPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface ParsedVisit {
  dedupeKey: string;
  placeId: string;
  startTimeMs: number;
  endTimeMs: number | null;
  timelinePath?: TimelinePoint[];
  sourceProbability?: number;
}

export interface ParsedTimeline {
  places: ParsedPlace[];
  visits: ParsedVisit[];
  skippedSegments: number;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === "object" && value !== null
    ? (value as Json)
    : null;
}

/** `"32.2396°, 77.1887°"` → `{lat, lng}`. */
function parseLatLngString(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /(-?\d+(?:\.\d+)?)\s*°\s*,\s*(-?\d+(?:\.\d+)?)\s*°?/,
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "string") {
    if (/^\d{10,}$/.test(value.trim())) {
      const ms = Number(value);
      return Number.isFinite(ms) ? ms : null;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "number") return value;
  return null;
}

const E7 = 1e7;

function e7ToDegrees(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value / E7
    : null;
}

function syntheticPlaceId(lat: number, lng: number): string {
  return `coord:${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function parseTimelinePath(value: unknown): TimelinePoint[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const points: TimelinePoint[] = [];
  for (const raw of value) {
    const entry = asObject(raw);
    if (!entry) continue;
    const coords = parseLatLngString(entry.point);
    const offset = entry.durationMinutesOffsetFromStart;
    if (!coords || typeof offset !== "number") continue;
    points.push({ ...coords, offsetMinutes: offset });
  }
  return points.length > 0 ? points : undefined;
}

function collectSemanticFormat(root: Json, result: ParsedTimeline): void {
  const segments = root.semanticSegments;
  if (!Array.isArray(segments)) return;

  for (const raw of segments) {
    const segment = asObject(raw);
    if (!segment) continue;
    const visit = asObject(segment.visit);
    const topCandidate = visit ? asObject(visit.topCandidate) : null;
    if (!visit || !topCandidate) {
      result.skippedSegments++;
      continue;
    }

    const startMs = parseTimestamp(segment.startTime);
    if (startMs === null) {
      result.skippedSegments++;
      continue;
    }
    const endMs = parseTimestamp(segment.endTime);

    let placeId =
      typeof topCandidate.placeId === "string" ? topCandidate.placeId : null;
    const coords =
      parseLatLngString(
        asObject(topCandidate.placeLocation)?.latLng,
      ) ?? null;
    if (!placeId && coords) {
      placeId = syntheticPlaceId(coords.lat, coords.lng);
    }
    if (!coords) {
      result.skippedSegments++;
      continue;
    }

    if (!result.places.some((p) => p.id === placeId!)) {
      result.places.push({
        id: placeId!,
        name: "",
        address: "",
        lat: coords.lat,
        lng: coords.lng,
      });
    }

    const probability =
      typeof topCandidate.probability === "number"
        ? topCandidate.probability
        : undefined;

    result.visits.push({
      dedupeKey: `${placeId}:${startMs}`,
      placeId: placeId!,
      startTimeMs: startMs,
      endTimeMs: endMs,
      timelinePath: parseTimelinePath(segment.timelinePath),
      ...(probability !== undefined ? { sourceProbability: probability } : {}),
    });
  }
}

function collectLegacyFormat(root: Json, result: ParsedTimeline): void {
  const objects = root.timelineObjects;
  if (!Array.isArray(objects)) return;

  for (const raw of objects) {
    const entry = asObject(raw);
    const placeVisit = entry ? asObject(entry.placeVisit) : null;
    if (!entry || !placeVisit) continue;
    const location = asObject(placeVisit.location);
    const duration = asObject(placeVisit.duration);
    if (!location || !duration) {
      result.skippedSegments++;
      continue;
    }

    const startMs = parseTimestamp(duration.startTimestampMs);
    if (startMs === null) {
      result.skippedSegments++;
      continue;
    }
    const endMs = parseTimestamp(duration.endTimestampMs);

    let placeId =
      typeof location.placeId === "string" ? location.placeId : null;
    const lat = e7ToDegrees(location.latitudeE7);
    const lng = e7ToDegrees(location.longitudeE7);
    if (!placeId && lat !== null && lng !== null) {
      placeId = syntheticPlaceId(lat, lng);
    }
    if (lat === null || lng === null) {
      result.skippedSegments++;
      continue;
    }

    if (!result.places.some((p) => p.id === placeId!)) {
      result.places.push({
        id: placeId!,
        name: typeof location.name === "string" ? location.name : "",
        address:
          typeof location.address === "string" ? location.address : "",
        lat,
        lng,
      });
    }

    const confidence =
      typeof location.locationConfidence === "number"
        ? location.locationConfidence / 100
        : null;
    result.visits.push({
      dedupeKey: `${placeId}:${startMs}`,
      placeId: placeId!,
      startTimeMs: startMs,
      endTimeMs: endMs,
      ...(confidence !== null
        ? { sourceProbability: confidence }
        : {}),
    });
  }
}

/**
 * Parse a Google Maps Timeline export into Places and Visits.
 * Accepts the phone "semanticSegments" format and the legacy
 * "timelineObjects" format. Pure and deterministic; runs in a worker.
 */
export function parseTimeline(input: unknown): ParsedTimeline {
  const root = asObject(input);
  const hasSemantic =
    root !== null && Array.isArray(root.semanticSegments);
  const hasLegacy = root !== null && Array.isArray(root.timelineObjects);
  if (!root || (!hasSemantic && !hasLegacy)) {
    throw new Error(
      "This file does not look like a Google Maps Timeline export",
    );
  }

  const result: ParsedTimeline = {
    places: [],
    visits: [],
    skippedSegments: 0,
  };
  if (hasSemantic) collectSemanticFormat(root, result);
  if (hasLegacy) collectLegacyFormat(root, result);
  return result;
}
