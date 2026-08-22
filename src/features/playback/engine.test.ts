import { describe, expect, it } from "vitest";
import {
  arrivedCountAt,
  buildPlaybackTimeline,
  defaultPlaybackRange,
  renderAt,
  routeGeometry,
} from "@/features/playback/engine";
import type { Place, Visit } from "@/db/schema";

const HOME = "ChIJhome";
const HUT = "ChIJhut";
const LAKE = "ChIJlake";
const GHOST = "ChIJghost";

function place(id: string, lat: number, lng: number): Place {
  return { id, name: id.replace("ChIJ", ""), address: "", lat, lng, isHome: 0, createdAt: 0 };
}

const PLACES = [place(HOME, 10, 10), place(HUT, 10.5, 10.6), place(LAKE, 10.2, 9.8)];

const T = (isoLocal: string) => Date.parse(isoLocal);

function visit(id: number, placeId: string, startIso: string, endIso: string | null): Visit {
  return {
    id,
    dedupeKey: `${placeId}:${startIso}`,
    placeId,
    startTimeMs: T(startIso),
    endTimeMs: endIso === null ? null : T(endIso),
    importId: null,
    createdAt: 0,
  };
}

/** Home over New Year → Hut (breadcrumb approach) → Lake (no path, open-ended). */
function fixtureVisits(): Visit[] {
  return [
    visit(1, HOME, "2024-01-01T00:00:00", "2024-01-03T00:00:00"),
    {
      ...visit(2, HUT, "2024-01-04T12:00:00", "2024-01-06T12:00:00"),
      timelinePath: [
        { lat: 10.3, lng: 10.15, offsetMinutes: -720 },
        { lat: 10.45, lng: 10.5, offsetMinutes: -360 },
      ],
    },
    visit(3, LAKE, "2024-01-07T18:00:00", null),
    visit(99, GHOST, "2024-02-01T00:00:00", "2024-02-02T00:00:00"),
  ];
}

const RANGE = { startMs: T("2024-01-01T00:00:00"), endMs: T("2024-01-10T00:00:00") };
const timelineOf = () => buildPlaybackTimeline(fixtureVisits(), PLACES, RANGE);
const travelLegs = (tl: ReturnType<typeof timelineOf>) =>
  tl.segments.filter((s) => s.kind === "travel");

describe("buildPlaybackTimeline", () => {
  it("orders stays and travel legs deterministically", () => {
    const a = timelineOf();
    const b = buildPlaybackTimeline(
      [...fixtureVisits()].reverse(),
      [...PLACES].reverse(),
      RANGE,
    );
    expect(b).toEqual(a);

    expect(a.segments.map((s) => s.kind)).toEqual([
      "stay",
      "travel",
      "stay",
      "travel",
      "stay",
    ]);
    const toHut = a.segments[1];
    expect(toHut.startMs).toEqual(T("2024-01-03T00:00:00"));
    expect(toHut.endMs).toEqual(T("2024-01-04T12:00:00"));
  });

  it("draws the breadcrumb polyline where present, bookended by the places", () => {
    const lines = routeGeometry(timelineOf());
    expect(lines[0].coordinates).toEqual([
      [10, 10],
      [10.15, 10.3],
      [10.5, 10.45],
      [10.6, 10.5],
    ]);
    expect(lines[1].coordinates).toEqual([
      [10.6, 10.5],
      [9.8, 10.2],
    ]);
  });

  it("falls back to a straight line when breadcrumbs fall outside the gap", () => {
    const visits = [
      visit(1, HOME, "2024-03-01T00:00:00", "2024-03-01T06:00:00"),
      {
        ...visit(2, HUT, "2024-03-01T12:00:00", "2024-03-01T18:00:00"),
        timelinePath: [
          { lat: 10.3, lng: 10.15, offsetMinutes: 30 },
          { lat: 10.45, lng: 10.5, offsetMinutes: 60 },
        ],
      },
    ];
    const range = { startMs: T("2024-03-01T00:00:00"), endMs: T("2024-03-02T00:00:00") };
    const timeline = buildPlaybackTimeline(visits, PLACES, range);
    const legs = travelLegs(timeline);
    expect(legs.length).toBe(1);
    if (legs[0].kind !== "travel") throw new Error("unreachable");
    expect(legs[0].points).toEqual([
      { lat: 10, lng: 10, atMs: T("2024-03-01T06:00:00") },
      { lat: 10.5, lng: 10.6, atMs: T("2024-03-01T12:00:00") },
    ]);
  });

  it("clamps an overlapping stay so the dot is never in two places", () => {
    const visits = [
      visit(1, HOME, "2024-04-01T00:00:00", "2024-04-05T00:00:00"),
      visit(2, HUT, "2024-04-03T00:00:00", "2024-04-06T00:00:00"),
    ];
    const range = { startMs: T("2024-04-01T00:00:00"), endMs: T("2024-04-08T00:00:00") };
    const timeline = buildPlaybackTimeline(visits, PLACES, range);
    const stayHome = timeline.segments.find((s) => s.kind === "stay");
    if (!stayHome || stayHome.kind !== "stay") throw new Error("no stay");
    expect(stayHome.endMs).toEqual(T("2024-04-03T00:00:00"));
    expect(travelLegs(timeline)).toEqual([]);
  });

  it("runs open-ended visits to the range end and skips unknown places", () => {
    const timeline = timelineOf();
    const last = timeline.segments[timeline.segments.length - 1];
    expect(last.endMs).toEqual(RANGE.endMs);
    const maxArrivalVisitId = Math.max(...timeline.arrivals.map((a) => a.visitId));
    expect(maxArrivalVisitId).toBeLessThan(100);
  });

  it("returns no segments for empty input", () => {
    const timeline = buildPlaybackTimeline([], PLACES, RANGE);
    expect(timeline.segments).toEqual([]);
    expect(arrivedCountAt(timeline, RANGE.endMs)).toBe(0);
  });
});

describe("renderAt", () => {
  it("is deterministic — identical inputs produce identical frames", () => {
    const grid: number[] = [];
    for (let ms = RANGE.startMs; ms <= RANGE.endMs; ms += 3_600_000 * 7) {
      grid.push(ms);
    }
    grid.push(
      RANGE.startMs,
      T("2024-01-03T00:00:00"),
      T("2024-01-04T06:00:00"),
      T("2024-01-04T12:00:00"),
      RANGE.endMs,
    );

    const first = grid.map((t) => renderAt(timelineOf(), t));
    const second = grid.map((t) => renderAt(buildPlaybackTimeline([...fixtureVisits()].reverse(), PLACES, RANGE), t));
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it("hides the dot before the first arrival and after the final stay", () => {
    const earlyRange = { ...RANGE, startMs: T("2023-12-25T00:00:00") };
    const early = buildPlaybackTimeline(fixtureVisits(), PLACES, earlyRange);
    expect(renderAt(early, T("2023-12-30T00:00:00"))).toMatchObject({
      phase: "before",
      dot: null,
    });

    const closedRange = { ...RANGE, endMs: T("2024-01-07T00:00:00") };
    const closed = buildPlaybackTimeline(fixtureVisits(), PLACES, closedRange);
    expect(renderAt(closed, closedRange.endMs)).toMatchObject({
      phase: "after",
      dot: null,
    });
  });

  it("parks at the place during a stay", () => {
    const frame = renderAt(timelineOf(), T("2024-01-05T00:00:00"));
    expect(frame.phase).toBe("stay");
    expect(frame.dot).toEqual({ lat: 10.5, lng: 10.6 });
    expect(frame.activePlaceId).toBe(HUT);
  });

  it("rides the breadcrumb polyline during travel", () => {
    const timeline = timelineOf();
    const frame = renderAt(timeline, T("2024-01-04T06:00:00"));
    expect(frame.phase).toBe("travel");
    expect(frame.dot).toEqual({ lat: 10.45, lng: 10.5 });
  });

  it("interpolates straight legs linearly", () => {
    const timeline = timelineOf();
    const mid = (T("2024-01-06T12:00:00") + T("2024-01-07T18:00:00")) / 2;
    const frame = renderAt(timeline, mid);
    expect(frame.phase).toBe("travel");
    expect(frame.dot).toEqual({ lat: 10.35, lng: 10.2 });
  });

  it("clamps t outside the range", () => {
    const earlyRange = { ...RANGE, startMs: T("2023-12-25T00:00:00") };
    const early = buildPlaybackTimeline(fixtureVisits(), PLACES, earlyRange);
    expect(renderAt(early, 0).phase).toBe("before");
    const timeline = timelineOf();
    const parked = renderAt(timeline, Number.MAX_SAFE_INTEGER);
    expect(parked.phase).toBe("stay");
    expect(parked.arrivedCount).toEqual(timeline.arrivals.length);
  });
});

describe("arrivedCountAt", () => {
  it("pops pins exactly as t crosses each arrival", () => {
    const timeline = timelineOf();
    expect(arrivedCountAt(timeline, T("2024-01-03T23:59:59"))).toBe(1);
    expect(arrivedCountAt(timeline, T("2024-01-04T12:00:00"))).toBe(2);
    expect(arrivedCountAt(timeline, T("2024-01-07T17:59:59"))).toBe(2);
    expect(arrivedCountAt(timeline, T("2024-01-07T18:00:00"))).toBe(3);
  });
});

describe("defaultPlaybackRange", () => {
  it("spans the data bounds and returns null without data", () => {
    expect(defaultPlaybackRange([])).toBeNull();
    const range = defaultPlaybackRange(fixtureVisits())!;
    expect(range.startMs).toEqual(T("2024-01-01T00:00:00"));
    expect(range.endMs).toEqual(T("2024-02-02T00:00:00"));
  });
});
