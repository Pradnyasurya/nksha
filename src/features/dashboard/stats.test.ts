import { describe, expect, it } from "vitest";
import {
  availableYears,
  daysAwayFromHome,
  distanceByMode,
  farthestPlaceFromHome,
  monthStripDensity,
  topPlacesByDwell,
  visitsInMonth,
} from "@/features/dashboard/stats";
import type { Place, Visit } from "@/db/schema";

const HOME = "ChIJhome";
const AWAY_A = "ChIJA";
const AWAY_B = "ChIJB";

function place(id: string): Place {
  return {
    id,
    name: `Place ${id}`,
    address: "",
    lat: 32.2,
    lng: 77.1,
    isHome: id === HOME ? 1 : 0,
    createdAt: 0,
  };
}

let seq = 0;
function visit(
  placeId: string,
  startIso: string,
  endIso: string | null,
): Visit {
  seq += 1;
  return {
    id: seq,
    dedupeKey: `${placeId}:${seq}`,
    placeId,
    startTimeMs: Date.parse(startIso),
    endTimeMs: endIso === null ? null : Date.parse(endIso),
    importId: null,
    createdAt: 0,
  };
}

/** Fixture: home in Mar, a week away at A (overlapping travel day), one
 *  single-day stay at B, then home again with an open-ended stay in May. */
const FIXTURE = [
  visit(HOME, "2026-03-10T10:00:00", "2026-03-12T09:00:00"),
  visit(AWAY_A, "2026-03-12T09:00:00", "2026-03-19T18:00:00"),
  visit(AWAY_B, "2026-04-02T08:00:00", "2026-04-02T20:00:00"),
  visit(HOME, "2026-05-01T10:00:00", null),
];

describe("daysAwayFromHome", () => {
  it("counts distinct local days covered by non-home visits", () => {
    expect(daysAwayFromHome(FIXTURE, HOME)).toBe(9);
  });

  it("never double-counts overlapping away stays", () => {
    const overlapping = [
      visit(AWAY_A, "2026-06-01T00:00:00", "2026-06-05T00:00:00"),
      visit(AWAY_B, "2026-06-03T00:00:00", "2026-06-07T00:00:00"),
    ];
    expect(daysAwayFromHome(overlapping, HOME)).toBe(7);
  });

  it("is zero when every visit is at Home", () => {
    expect(
      daysAwayFromHome([visit(HOME, "2026-01-01T00:00:00", "2026-01-31T23:00:00")], HOME),
    ).toBe(0);
  });

  it("clamps open-ended non-home stays to the provided bound", () => {
    const openEndedAway = [visit(AWAY_A, "2026-07-01T10:00:00", null)];
    const full = daysAwayFromHome(openEndedAway, HOME, {
      clampEndMs: Date.parse("2026-07-31T00:00:00"),
    });
    const short = daysAwayFromHome(openEndedAway, HOME, {
      clampEndMs: Date.parse("2026-07-03T00:00:00"),
    });
    expect(full).toBe(31);
    expect(short).toBe(3);
  });
});

describe("topPlacesByDwell", () => {
  it("ranks by cumulative dwell duration, not visit count", () => {
    const manyShortAtB = Array.from({ length: 5 }, (_, i) =>
      visit(AWAY_B, `2026-02-0${i + 1}T10:00:00`, `2026-02-0${i + 1}T11:00:00`),
    );
    const oneLongAtA = [visit(AWAY_A, "2026-02-01T00:00:00", "2026-02-20T00:00:00")];
    const top = topPlacesByDwell([...manyShortAtB, ...oneLongAtA], [place(HOME), place(AWAY_A), place(AWAY_B)], 5, Date.parse("2026-03-01T00:00:00"));
    expect(top[0].place.id).toBe(AWAY_A);
    expect(top[0].totalDwellMs).toBe(Date.parse("2026-02-20T00:00:00") - Date.parse("2026-02-01T00:00:00"));
    expect(top[1].place.id).toBe(AWAY_B);
    expect(top[1]).toMatchObject({ totalDwellMs: 5 * 3_600_000, visitCount: 5 });
  });

  it("caps at n entries", () => {
    const places = [HOME, AWAY_A, AWAY_B, "C", "D", "E"].map((id) =>
      place(id),
    );
    const visits = places.map((p, i) =>
      visit(p.id, `2026-01-0${i + 1}T00:00:00`, `2026-01-0${i + 1}T01:00:00`),
    );
    expect(topPlacesByDwell(visits, places, 5)).toHaveLength(5);
  });
});

describe("monthStripDensity", () => {
  it("counts distinct visited days per month", () => {
    const density = monthStripDensity(FIXTURE, 2026);
    expect(density[2]).toBe(10);
    expect(density[3]).toBe(1);
    expect(density[4]).toBe(1);
    expect(density.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("ignores other years", () => {
    const density = monthStripDensity(
      [...FIXTURE, visit(AWAY_A, "2025-12-24T00:00:00", "2025-12-26T00:00:00")],
      2025,
    );
    expect(density[11]).toBe(3);
    expect(density[2]).toBe(0);
  });
});

describe("visitsInMonth", () => {
  const CLAMP = Date.parse("2026-08-22T00:00:00");

  it("keeps visits overlapping the month window incl. open ends", () => {
    const kept = visitsInMonth(FIXTURE, "2026-05", { clampEndMs: CLAMP });
    expect(kept.map((v) => v.placeId)).toContain(HOME);
    const march = visitsInMonth(FIXTURE, "2026-03", { clampEndMs: CLAMP });
    expect(march).toHaveLength(2);
  });

  it("clamps open-ended stays so later months stay empty", () => {
    expect(visitsInMonth(FIXTURE, "2026-11", { clampEndMs: CLAMP })).toHaveLength(0);
  });
});

describe("availableYears", () => {
  it("returns sorted distinct years from data", () => {
    expect(availableYears([...FIXTURE, visit(AWAY_A, "2024-08-01T00:00:00", null)])).toEqual([
      2024, 2026,
    ]);
  });
});

describe("distanceByMode (#11)", () => {
  function movement(mode: string, meters: number) {
    return {
      dedupeKey: `act:${mode}:${meters}`,
      mode: mode as never,
      startTimeMs: 0,
      endTimeMs: null,
      distanceMeters: meters,
      importId: null,
      createdAt: 0,
    };
  }

  it("sums distances per mode in dashboard order", () => {
    const totals = distanceByMode([
      movement("driving", 1000),
      movement("driving", 2500),
      movement("walking", 300),
      movement("transit", 10_000),
      movement("cycling", 4200),
      movement("other", 999),
    ]);
    expect(totals.map((t) => t.mode)).toEqual([
      "driving",
      "walking",
      "cycling",
      "transit",
      "other",
    ]);
    expect(totals[0].distanceMeters).toBe(3500);
    expect(totals[0].movementCount).toBe(2);
    expect(totals[1].distanceMeters).toBe(300);
    expect(totals[2].distanceMeters).toBe(4200);
    expect(totals[3].distanceMeters).toBe(10_000);
    expect(totals[4].distanceMeters).toBe(999);
  });

  it("omits modes with no movements and ignores negative garbage", () => {
    const totals = distanceByMode([
      movement("walking", -5),
      movement("walking", 700),
    ]);
    expect(totals).toHaveLength(1);
    expect(totals[0]).toEqual({
      mode: "walking",
      distanceMeters: 700,
      movementCount: 2,
    });
  });

  it("returns empty for empty input", () => {
    expect(distanceByMode([])).toEqual([]);
  });
});

describe("farthestPlaceFromHome (#11)", () => {
  /** Places at explicit coordinates along the equator. */
  function placeAt(id: string, lat: number, lng: number): Place {
    return {
      id,
      name: `Place ${id}`,
      address: "",
      lat,
      lng,
      isHome: id === HOME ? 1 : 0,
      createdAt: 0,
    };
  }

  it("picks the visited place farthest from Home", () => {
    const home = placeAt(HOME, 0, 0);
    const near = placeAt(AWAY_A, 1, 0);
    const far = placeAt(AWAY_B, 5, 0);
    // Only visited places qualify — B has no visit here.
    const best = farthestPlaceFromHome(
      [visit(AWAY_A, "2026-03-12T09:00:00", "2026-03-19T18:00:00")],
      [home, near, far],
      HOME,
    );
    expect(best?.place.id).toBe(AWAY_A);
    expect(best!.distanceMeters).toBeGreaterThan(110_000);
    expect(best!.distanceMeters).toBeLessThan(115_000);
  });

  it("prefers a farther place once any visit reaches it", () => {
    const home = placeAt(HOME, 0, 0);
    const near = placeAt(AWAY_A, 1, 0);
    const far = placeAt(AWAY_B, 5, 0);
    const best = farthestPlaceFromHome(
      [
        visit(AWAY_A, "2026-03-12T09:00:00", "2026-03-19T18:00:00"),
        visit(AWAY_B, "2026-04-02T08:00:00", "2026-04-02T20:00:00"),
      ],
      [home, near, far],
      HOME,
    );
    expect(best?.place.id).toBe(AWAY_B);
  });

  it("returns null without a home or without visits", () => {
    const home = placeAt(HOME, 0, 0);
    expect(farthestPlaceFromHome([visit(HOME, "2026-05-01T10:00:00", null)], [home], "missing")).toBeNull();
    expect(farthestPlaceFromHome([], [home], HOME)).toBeNull();
  });
});
