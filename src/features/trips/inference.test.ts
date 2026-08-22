import { describe, expect, it } from "vitest";
import {
  INFER_AWAY_RADIUS_M,
  inferTripWindows,
} from "@/features/trips/inference";
import type { Place, Trip, Visit } from "@/db/schema";

const HOME_ID = "ChIJhome";
const FAR_ID = "ChIJfar";
const NEAR_ID = "ChIJnear";

function place(id: string, lat: number, lng: number, name = id): Place {
  return {
    id,
    name,
    address: "",
    lat,
    lng,
    isHome: id === HOME_ID ? 1 : 0,
    createdAt: 0,
  };
}

/** Home at origin; ~0.55° latitude ≈ 61 km north; ~0.10° ≈ 11 km north. */
const PLACES = [
  place(HOME_ID, 0, 0),
  place(FAR_ID, 0.55, 0, "Far Highlands"),
  place(NEAR_ID, 0.1, 0, "Near Market"),
];

let seq = 0;
function v(placeId: string, startIsoLocal: string, endIsoLocal: string | null): Visit {
  seq += 1;
  return {
    id: seq,
    dedupeKey: `${placeId}:${seq}`,
    placeId,
    startTimeMs: Date.parse(startIsoLocal),
    endTimeMs: endIsoLocal === null ? null : Date.parse(endIsoLocal),
    importId: null,
    createdAt: 0,
  };
}

function trip(startDay: string, endDay: string, provenance: Trip["provenance"], name?: string): Trip {
  return {
    id: `${startDay}-${endDay}`,
    name: name ?? `${startDay}..${endDay}`,
    startDay,
    endDay,
    provenance,
    createdAt: 0,
  };
}

const BASE_TRIPS: Trip[] = [];
const NO_DISMISSED: { startDay: string; endDay: string }[] = [];

describe("inferTripWindows", () => {
  it("spans departure through return, including near-home travel-day stops", () => {
    const visits = [
      // Departure day: morning near home, afternoon far away.
      v(NEAR_ID, "2026-03-12T09:00:00", "2026-03-12T11:00:00"),
      v(FAR_ID, "2026-03-12T15:00:00", "2026-03-18T10:00:00"),
      // Return day: still far in the morning, home by evening.
      v(FAR_ID, "2026-03-18T10:00:00", "2026-03-19T08:00:00"),
      v(HOME_ID, "2026-03-19T20:00:00", null),
    ];
    const windows = inferTripWindows({
      visits,
      places: PLACES,
      homePlaceId: HOME_ID,
      trips: BASE_TRIPS,
      dismissedRanges: NO_DISMISSED,
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].startDay).toBe("2026-03-12");
    expect(windows[0].endDay).toBe("2026-03-19");
    expect(windows[0].name).toContain("Far Highlands");
  });

  it("splits separate away clusters into distinct trips", () => {
    const visits = [
      v(FAR_ID, "2026-03-02T10:00:00", "2026-03-04T10:00:00"),
      v(HOME_ID, "2026-03-05T10:00:00", "2026-03-09T10:00:00"),
      v(FAR_ID, "2026-03-10T10:00:00", "2026-03-11T10:00:00"),
    ];
    const windows = inferTripWindows({
      visits,
      places: PLACES,
      homePlaceId: HOME_ID,
      trips: BASE_TRIPS,
      dismissedRanges: NO_DISMISSED,
    });
    expect(windows.map((w) => w.startDay)).toEqual(["2026-03-02", "2026-03-10"]);
  });

  it("never suggests inside a dismissed range", () => {
    const visits = [v(FAR_ID, "2026-03-02T10:00:00", "2026-03-04T10:00:00")];
    const windows = inferTripWindows({
      visits,
      places: PLACES,
      homePlaceId: HOME_ID,
      trips: BASE_TRIPS,
      dismissedRanges: [{ startDay: "2026-03-01", endDay: "2026-03-31" }],
    });
    expect(windows).toHaveLength(0);
  });

  it("declared trips trim overlapping candidates instead of rejecting them", () => {
    const declared = [trip("2026-03-03", "2026-03-10", "declared", "User-made")];
    const visits = [
      v(FAR_ID, "2026-03-02T10:00:00", "2026-03-04T10:00:00"),
      v(FAR_ID, "2026-03-12T10:00:00", "2026-03-14T10:00:00"),
    ];
    const windows = inferTripWindows({
      visits,
      places: PLACES,
      homePlaceId: HOME_ID,
      trips: declared,
      dismissedRanges: NO_DISMISSED,
    });
    expect(windows.map((w) => [w.startDay, w.endDay])).toEqual([
      ["2026-03-02", "2026-03-02"],
      ["2026-03-12", "2026-03-14"],
    ]);
  });

  it("is silent without a Home", () => {
    const visits = [v(FAR_ID, "2026-03-02T10:00:00", "2026-03-04T10:00:00")];
    expect(
      inferTripWindows({
        visits,
        places: PLACES,
        homePlaceId: null,
        trips: BASE_TRIPS,
        dismissedRanges: NO_DISMISSED,
      }),
    ).toEqual([]);
  });

  it("is deterministic: same input, same output", () => {
    const input = {
      visits: [
        v(FAR_ID, "2026-07-01T10:00:00", "2026-07-03T10:00:00"),
        v(NEAR_ID, "2026-07-02T10:00:00", "2026-07-02T12:00:00"),
      ],
      places: PLACES,
      homePlaceId: HOME_ID,
      trips: BASE_TRIPS,
      dismissedRanges: NO_DISMISSED,
    };
    expect(inferTripWindows(input)).toEqual(inferTripWindows(input));
  });

  it("keeps the documented radius honest", () => {
    expect(INFER_AWAY_RADIUS_M).toBe(50_000);
  });
});
