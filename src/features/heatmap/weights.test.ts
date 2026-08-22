import { describe, expect, it } from "vitest";
import { buildDwellIndex, sumRange } from "@/features/heatmap/weights";
import type { Place, Visit } from "@/db/schema";

const HOUR = 3_600_000;
const T = (iso: string) => Date.parse(iso);

function place(id: string, lat = 10, lng = 10): Place {
  return { id, name: id, address: "", lat, lng, isHome: 0, createdAt: 0 };
}

function visit(placeId: string, startIso: string, endIso: string | null): Visit {
  return {
    dedupeKey: `${placeId}:${startIso}`,
    placeId,
    startTimeMs: T(startIso),
    endTimeMs: endIso === null ? null : T(endIso),
    importId: null,
    createdAt: 0,
  };
}

const PLACES = [place("home"), place("hut", 20, 20), place("lake", 5, -5)];

describe("buildDwellIndex", () => {
  it("weights places by total dwell time, bucketed per year", () => {
    const visits = [
      visit("home", "2023-01-01T00:00:00", "2023-01-02T00:00:00"),
      visit("home", "2024-01-01T00:00:00", "2024-01-04T12:00:00"),
      visit("hut", "2024-06-01T00:00:00", "2024-06-03T00:00:00"),
    ];
    const index = buildDwellIndex(visits, PLACES);
    expect(index.years).toEqual([2023, 2024]);

    const homeRow = index.rows.find((r) => r.place.id === "home")!;
    expect(homeRow.dwellPerYearMs[0]).toBe(24 * HOUR);
    expect(homeRow.dwellPerYearMs[1]).toBe(84 * HOUR);
    expect(homeRow.totalDwellMs).toBe(108 * HOUR);

    const hutRow = index.rows.find((r) => r.place.id === "hut")!;
    expect(hutRow.totalDwellMs).toBe(48 * HOUR);
  });

  it("clamps open-ended visits to the clamp instant", () => {
    const visits = [visit("lake", "2022-05-01T00:00:00", null)];
    const clamp = T("2022-05-02T06:00:00");
    const index = buildDwellIndex(visits, PLACES, clamp);
    const lakeRow = index.rows.find((r) => r.place.id === "lake")!;
    expect(lakeRow.totalDwellMs).toBe(30 * HOUR);
  });

  it("ignores visits without a known place and zero-length stays", () => {
    const visits = [
      visit("ghost", "2024-01-01T00:00:00", "2024-01-02T00:00:00"),
      visit("home", "2024-02-01T00:00:00", "2024-02-01T00:00:00"),
    ];
    const index = buildDwellIndex(visits, PLACES);
    expect(index.rows).toEqual([]);
    expect(index.years).toEqual([]);
    expect(sumRange(index, 2020, 2030)).toEqual([]);
  });
});

describe("sumRange", () => {
  it("slices precomputed years inclusively and sorts by weight", () => {
    const visits = [
      visit("home", "2021-01-01T00:00:00", "2021-01-10T00:00:00"),
      visit("hut", "2022-01-01T00:00:00", "2022-01-30T00:00:00"),
      visit("lake", "2023-01-01T00:00:00", "2023-01-02T00:00:00"),
    ];
    const index = buildDwellIndex(visits, PLACES);

    expect(sumRange(index, 2021, 2021).map((w) => w.place.id)).toEqual(["home"]);
    const window = sumRange(index, 2022, 2023);
    expect(window.map((w) => w.place.id)).toEqual(["hut", "lake"]);
    expect(window[0].dwellMs).toBe(29 * 24 * HOUR);
    expect(window[1].dwellMs).toBe(24 * HOUR);

    // Everything at once equals the per-place totals.
    const all = new Map(
      sumRange(index, 1900, 2100).map((w) => [w.place.id, w.dwellMs]),
    );
    expect(all.get("home")).toBe(9 * 24 * HOUR);
    expect(all.get("hut")).toBe(29 * 24 * HOUR);
    expect(all.get("lake")).toBe(24 * HOUR);
  });

  it("returns empty for windows outside the data", () => {
    const index = buildDwellIndex([visit("home", "2024-01-01T00:00:00", "2024-01-02T00:00:00")], PLACES);
    expect(sumRange(index, 2030, 2040)).toEqual([]);
  });
});
