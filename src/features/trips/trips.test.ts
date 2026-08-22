import { describe, expect, it } from "vitest";
import {
  overlapsAnyTrip,
  visitsInTrip,
} from "@/features/trips/trips";
import type { Trip, Visit } from "@/db/schema";

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

function t(startDay: string, endDay: string, id = `${startDay}-${endDay}`): Trip {
  return { id, name: id, startDay, endDay, provenance: "declared", createdAt: 0 };
}

describe("visitsInTrip", () => {
  it("claims exactly the visits whose span touches interior days", () => {
    const inside = [
      v("A", "2026-03-13T10:00:00", "2026-03-15T10:00:00"),
      v("B", "2026-03-19T08:00:00", null),
    ];
    const outside = [
      v("C", "2026-03-11T23:00:00", "2026-03-11T23:59:00"),
      v("D", "2026-03-20T00:00:00", "2026-03-20T01:00:00"),
    ];
    const claimed = visitsInTrip([...inside, ...outside], "2026-03-12", "2026-03-19");
    expect(claimed.map((x) => x.id).sort()).toEqual(
      inside.map((x) => x.id).sort(),
    );
  });

  it("counts boundary days inclusively", () => {
    const startsOnEndDay = v("A", "2026-03-19T00:00:00", "2026-03-19T00:30:00");
    expect(visitsInTrip([startsOnEndDay], "2026-03-12", "2026-03-19")).toHaveLength(1);

    const startsNextDay = v("B", "2026-03-20T00:00:00", "2026-03-20T01:00:00");
    expect(visitsInTrip([startsNextDay], "2026-03-12", "2026-03-19")).toHaveLength(0);
  });

  it("recomputes membership when dates change (derived, not stored)", () => {
    const movable = v("A", "2026-05-02T10:00:00", "2026-05-04T10:00:00");
    expect(visitsInTrip([movable], "2026-06-01", "2026-06-07")).toHaveLength(0);
    movable.startTimeMs = Date.parse("2026-06-02T10:00:00");
    movable.endTimeMs = Date.parse("2026-06-03T10:00:00");
    expect(visitsInTrip([movable], "2026-06-01", "2026-06-07")).toEqual([movable]);
  });
});

describe("overlapsAnyTrip", () => {
  const existing = [t("2026-03-10", "2026-03-14"), t("2026-04-01", "2026-04-05")];

  it("rejects any shared day, including single-day touch-ins", () => {
    expect(overlapsAnyTrip(existing, "2026-03-14", "2026-03-16")).toBe(true);
    expect(overlapsAnyTrip(existing, "2026-03-09", "2026-03-10")).toBe(true);
  });

  it("allows strictly adjacent windows", () => {
    expect(overlapsAnyTrip(existing, "2026-03-15", "2026-03-31")).toBe(false);
  });

  it("ignores the trip being edited", () => {
    expect(
      overlapsAnyTrip(existing, "2026-03-10", "2026-03-14", "2026-03-10-2026-03-14"),
    ).toBe(false);
  });
});
