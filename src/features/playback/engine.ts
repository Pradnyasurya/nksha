import type { Place, Visit } from "@/db/schema";

/**
 * Deterministic playback engine (#8). One timeline built from Visits +
 * Places; one pure `render(t)` that turns any timestamp into a frame.
 * Identical inputs always produce identical frames — the MP4 exporter (#9)
 * consumes this exact function. No clocks, no randomness.
 */

export interface PlaybackRange {
  startMs: number;
  endMs: number;
}

export interface PlaybackPoint {
  lat: number;
  lng: number;
}

interface TimedPoint extends PlaybackPoint {
  atMs: number;
}

export interface PlaybackStay {
  kind: "stay";
  visitId: number;
  placeId: string;
  startMs: number;
  endMs: number;
  point: PlaybackPoint;
}

export interface PlaybackTravel {
  kind: "travel";
  toVisitId: number | null;
  startMs: number;
  endMs: number;
  /** ≥2 waypoints, time-sorted; first departs at startMs, last arrives at endMs. */
  points: TimedPoint[];
}

export type PlaybackSegment = PlaybackStay | PlaybackTravel;

export interface PlaybackTimeline {
  segments: PlaybackSegment[];
  /** Visit arrivals sorted by time, for O(log n) popped-pin counts. */
  arrivals: Array<{ visitId: number; atMs: number }>;
  rangeStartMs: number;
  rangeEndMs: number;
}

export type PlaybackPhase = "before" | "stay" | "travel" | "after";

export interface PlaybackFrame {
  phase: PlaybackPhase;
  /** Dot position; null before departure and after the final stay ends. */
  dot: PlaybackPoint | null;
  activeVisitId: number | null;
  activePlaceId: string | null;
  /** Visits whose arrival t has crossed (pins that have popped). */
  arrivedCount: number;
}

/** Data bounds for initial range selection; null when there is no data. */
export function defaultPlaybackRange(visits: Visit[]): PlaybackRange | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const visit of visits) {
    if (start === null || visit.startTimeMs < start) start = visit.startTimeMs;
    const stop = visit.endTimeMs ?? visit.startTimeMs;
    if (end === null || stop > end) end = stop;
  }
  if (start === null || end === null || end < start) return null;
  return { startMs: start, endMs: end };
}

/**
 * Build the ordered segment list covering `[range.startMs, range.endMs]`.
 * Stays clamp against the next arrival so the dot is never in two places;
 * open-ended stays run to the range end.
 */
export function buildPlaybackTimeline(
  visits: Visit[],
  places: Place[],
  range: PlaybackRange,
): PlaybackTimeline {
  const placesById = new Map(places.map((p) => [p.id, p]));
  const included = visits
    .filter(
      (v) =>
        // Inclusive so a visit starting exactly at the range end (e.g. the
        // open-ended "still here" stay that defines defaultPlaybackRange)
        // still counts as an arrival instead of vanishing.
        placesById.has(v.placeId) &&
        v.startTimeMs <= range.endMs &&
        effectiveEnd(v, range) > range.startMs,
    )
    .sort(chronological);

  const segments: PlaybackSegment[] = [];
  const arrivals: PlaybackTimeline["arrivals"] = [];
  let cursor = range.startMs;
  let previousPlace: Place | null = null;

  for (let i = 0; i < included.length; i++) {
    const visit = included[i];
    const place = placesById.get(visit.placeId)!;
    const arrivalMs = Math.max(visit.startTimeMs, range.startMs);

    if (previousPlace !== null && arrivalMs > cursor) {
      segments.push(
        travelSegment(previousPlace, place, visit, cursor, arrivalMs),
      );
    }

    const nextArrival =
      i + 1 < included.length
        ? Math.max(included[i + 1].startTimeMs, range.startMs)
        : range.endMs;
    const endMs = Math.max(
      arrivalMs,
      Math.min(visit.endTimeMs ?? range.endMs, nextArrival, range.endMs),
    );
    if (endMs > arrivalMs) {
      segments.push({
        kind: "stay",
        visitId: visit.id!,
        placeId: place.id,
        startMs: arrivalMs,
        endMs,
        point: { lat: place.lat, lng: place.lng },
      });
    }
    arrivals.push({ visitId: visit.id!, atMs: arrivalMs });

    cursor = Math.max(cursor, endMs);
    previousPlace = place;
  }

  return {
    segments,
    arrivals,
    rangeStartMs: range.startMs,
    rangeEndMs: range.endMs,
  };
}

/** The frame at instant `t`. Pure and deterministic. */
export function renderAt(timeline: PlaybackTimeline, t: number): PlaybackFrame {
  const clamped = Math.min(
    Math.max(t, timeline.rangeStartMs),
    timeline.rangeEndMs,
  );

  for (const segment of timeline.segments) {
    if (clamped < segment.startMs || clamped > segment.endMs) continue;
    if (segment.kind === "stay") {
      return frame("stay", segment.point, segment.visitId, segment.placeId, timeline, clamped);
    }
    return frame(
      "travel",
      interpolate(segment.points, clamped),
      segment.toVisitId,
      null,
      timeline,
      clamped,
    );
  }

  const before = !timeline.segments[0] || clamped < timeline.segments[0].startMs;
  return frame(
    before ? "before" : "after",
    null,
    null,
    null,
    timeline,
    clamped,
  );
}

function frame(
  phase: PlaybackPhase,
  dot: PlaybackPoint | null,
  activeVisitId: number | null,
  activePlaceId: string | null,
  timeline: PlaybackTimeline,
  t: number,
): PlaybackFrame {
  return {
    phase,
    dot,
    activeVisitId,
    activePlaceId,
    arrivedCount: arrivedCountAt(timeline, t),
  };
}

/** How many pins have popped by `t` (binary search over sorted arrivals). */
export function arrivedCountAt(timeline: PlaybackTimeline, t: number): number {
  let low = 0;
  let high = timeline.arrivals.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (timeline.arrivals[mid].atMs <= t) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Full route geometry for the map: every travel polyline. */
export interface RouteLine {
  coordinates: Array<[number, number]>;
}

export function routeGeometry(timeline: PlaybackTimeline): RouteLine[] {
  const out: RouteLine[] = [];
  for (const segment of timeline.segments) {
    if (segment.kind === "travel") {
      out.push({
        coordinates: segment.points.map(
          (p) => [p.lng, p.lat] as [number, number],
        ),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

function chronological(a: Visit, b: Visit): number {
  if (a.startTimeMs !== b.startTimeMs) return a.startTimeMs - b.startTimeMs;
  const byKey = a.dedupeKey.localeCompare(b.dedupeKey);
  if (byKey !== 0) return byKey;
  return (a.id ?? 0) - (b.id ?? 0);
}

function effectiveEnd(visit: Visit, range: PlaybackRange): number {
  return Math.min(visit.endTimeMs ?? range.endMs, range.endMs);
}

function travelSegment(
  from: Place,
  to: Place,
  arriving: Visit,
  startMs: number,
  endMs: number,
): PlaybackTravel {
  const crumbs = [...(arriving.timelinePath ?? [])].sort(
    (a, b) => a.offsetMinutes - b.offsetMinutes,
  );
  const timed: TimedPoint[] = [];
  if (crumbs.length >= 2) {
    for (const crumb of crumbs) {
      timed.push({
        lat: crumb.lat,
        lng: crumb.lng,
        atMs: arriving.startTimeMs + crumb.offsetMinutes * 60_000,
      });
    }
    // Breadcrumbs lead up to (or away from) arrival; keep only what fits the
    // gap, then bookend with the two Places so the leg is continuous.
    const within = timed.filter(
      (p) => p.atMs >= startMs && p.atMs <= endMs,
    );
    const points = dedupAdjacent([
      { lat: from.lat, lng: from.lng, atMs: startMs },
      ...within,
      { lat: to.lat, lng: to.lng, atMs: endMs },
    ]);
    if (points.length >= 2) {
      return {
        kind: "travel",
        toVisitId: arriving.id ?? null,
        startMs,
        endMs,
        points: monotonic(points),
      };
    }
  }
  return {
    kind: "travel",
    toVisitId: arriving.id ?? null,
    startMs,
    endMs,
    points: [
      { lat: from.lat, lng: from.lng, atMs: startMs },
      { lat: to.lat, lng: to.lng, atMs: endMs },
    ],
  };
}

function dedupAdjacent(points: TimedPoint[]): TimedPoint[] {
  const out: TimedPoint[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.lat - point.lat) < 1e-9 &&
      Math.abs(prev.lng - point.lng) < 1e-9
    ) {
      prev.atMs = Math.max(prev.atMs, point.atMs);
      continue;
    }
    out.push({ ...point });
  }
  return out;
}

/** Enforce non-decreasing waypoint times so interpolation never runs backwards. */
function monotonic(points: TimedPoint[]): TimedPoint[] {
  const out: TimedPoint[] = [];
  let floor = -Infinity;
  for (const point of points) {
    const atMs = Math.max(point.atMs, floor);
    floor = atMs;
    out.push(atMs === point.atMs ? point : { ...point, atMs });
  }
  return out;
}

/** Piecewise-linear interpolation across time-sorted waypoints. */
function interpolate(points: TimedPoint[], t: number): PlaybackPoint {
  if (t <= points[0].atMs) return points[0];
  const last = points[points.length - 1];
  if (t >= last.atMs) return last;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (t <= b.atMs) {
      const a = points[i - 1];
      const span = b.atMs - a.atMs;
      const f = span <= 0 ? 1 : (t - a.atMs) / span;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
      };
    }
  }
  return last;
}
