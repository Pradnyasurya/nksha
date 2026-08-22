import { describe, expect, it } from "vitest";
import {
  buildPlaybackTimeline,
  travelledDistanceMeters,
} from "@/features/playback/engine";
import type { Place, Visit } from "@/db/schema";

const HOUR = 3_600_000;

function place(id: string, lat: number, lng: number): Place {
  return { id, name: id, address: "", lat, lng, isHome: 0, createdAt: 0 };
}

function visit(id: number, placeId: string, startMs: number, endMs: number | null): Visit {
  return {
    id,
    dedupeKey: `${placeId}:${startMs}`,
    placeId,
    startTimeMs: startMs,
    endTimeMs: endMs,
    importId: null,
    createdAt: 0,
  };
}

// Two places roughly 111 km apart in latitude; a third at the first spot.
const places = [place("a", 10, 10), place("b", 11, 10), place("c", 10, 10)];
const t0 = Date.UTC(2026, 0, 1);
const visits = [
  visit(1, "a", t0, t0 + HOUR),
  visit(2, "b", t0 + 2 * HOUR, t0 + 3 * HOUR),
  visit(3, "c", t0 + 4 * HOUR, null),
];

describe("travelledDistanceMeters", () => {
  const timeline = buildPlaybackTimeline(visits, places, {
    startMs: t0,
    endMs: t0 + 5 * HOUR,
  });

  it("is zero before any travel happens", () => {
    expect(travelledDistanceMeters(timeline, t0)).toBe(0);
    expect(travelledDistanceMeters(timeline, t0 + HOUR)).toBe(0);
  });

  it("counts full legs once they are behind the clock", () => {
    const total = travelledDistanceMeters(timeline, t0 + 5 * HOUR);
    // a→b and b→c are each ~111 km.
    expect(total).toBeGreaterThan(200_000);
    expect(total).toBeLessThan(260_000);
  });

  it("grows monotonically as t advances", () => {
    const midTravel = travelledDistanceMeters(timeline, t0 + 1.5 * HOUR);
    const afterArrival = travelledDistanceMeters(timeline, t0 + 2 * HOUR);
    expect(midTravel).toBeGreaterThan(0);
    expect(midTravel).toBeLessThan(afterArrival);
  });

  it("never counts legs that have not started", () => {
    const beforeSecondLeg = travelledDistanceMeters(timeline, t0 + 1.9 * HOUR);
    expect(beforeSecondLeg).toBeLessThan(120_000);
  });
});
