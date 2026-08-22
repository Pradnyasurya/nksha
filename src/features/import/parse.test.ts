import { describe, expect, it } from "vitest";
import { parseTimeline } from "@/features/import/parse";

const NEW_FORMAT = {
  semanticSegments: [
    {
      startTime: "2026-03-12T10:00:00+05:30",
      endTime: "2026-03-12T13:30:00+05:30",
      timelinePath: [
        { point: "32.2396°, 77.1887°", durationMinutesOffsetFromStart: 0 },
        { point: "32.2410°, 77.1902°", durationMinutesOffsetFromStart: 45 },
      ],
      visit: {
        topCandidate: {
          placeId: "ChIJcafe",
          placeLocation: { latLng: "32.2396°, 77.1887°" },
          probability: 0.91,
        },
      },
    },
    {
      startTime: "2026-03-13T08:00:00Z",
      visit: {
        topCandidate: {
          placeId: "ChIJmarket",
          placeLocation: { latLng: "28.6139°, 77.2090°" },
          probability: 0.75,
        },
      },
    },
    {
      startTime: "2026-03-14T09:00:00Z",
      endTime: "2026-03-14T10:00:00Z",
      visit: {},
    },
    { startTime: "2026-03-15T09:00:00Z", endTime: "2026-03-15T10:00:00Z" },
  ],
};

const LEGACY_FORMAT = {
  timelineObjects: [
    {
      placeVisit: {
        location: {
          placeId: "ChIJold",
          name: "Old Cafe",
          address: "Marktstraße 1, Hamburg",
          latitudeE7: 535508600,
          longitudeE7: 99923040,
          locationConfidence: 82.5,
        },
        duration: {
          startTimestampMs: "1773226400000",
          endTimestampMs: "1773237200000",
        },
      },
    },
  ],
};

describe("parseTimeline (phone semantic format)", () => {
  const result = parseTimeline(NEW_FORMAT);

  it("extracts one Place per unique placeId", () => {
    const ids = result.places.map((p) => p.id);
    expect(ids).toContain("ChIJcafe");
    expect(ids).toContain("ChIJmarket");
    const cafe = result.places.find((p) => p.id === "ChIJcafe")!;
    expect(cafe.lat).toBeCloseTo(32.2396, 4);
    expect(cafe.lng).toBeCloseTo(77.1887, 4);
  });

  it("shapes each placeVisit as an arrival/departure span", () => {
    const cafeVisit = result.visits.find((v) =>
      v.dedupeKey.startsWith("ChIJcafe:"),
    )!;
    expect(cafeVisit.placeId).toBe("ChIJcafe");
    expect(cafeVisit.startTimeMs).toBe(Date.parse("2026-03-12T10:00:00+05:30"));
    expect(cafeVisit.endTimeMs).toBe(Date.parse("2026-03-12T13:30:00+05:30"));
  });

  it("attaches timelinePath breadcrumbs where present", () => {
    const cafeVisit = result.visits.find((v) =>
      v.dedupeKey.startsWith("ChIJcafe:"),
    )!;
    expect(cafeVisit.timelinePath).toHaveLength(2);
    expect(cafeVisit.timelinePath![1]).toEqual({
      lat: 32.241,
      lng: 77.1902,
      offsetMinutes: 45,
    });
  });

  it("keeps visits without an end time open-ended", () => {
    const market = result.visits.find((v) =>
      v.dedupeKey.startsWith("ChIJmarket:"),
    )!;
    expect(market.endTimeMs).toBeNull();
  });

  it("skips segments that carry no usable visit", () => {
    expect(result.visits).toHaveLength(2);
    expect(result.skippedSegments).toBe(2);
  });

  it("is deterministic for identical input", () => {
    expect(parseTimeline(NEW_FORMAT)).toEqual(result);
  });
});

describe("parseTimeline (legacy Records.json format)", () => {
  const result = parseTimeline(LEGACY_FORMAT);

  it("maps placeVisit with E7 coordinates and ms timestamps", () => {
    expect(result.places[0]).toMatchObject({
      id: "ChIJold",
      name: "Old Cafe",
      address: "Marktstraße 1, Hamburg",
      lat: 53.55086,
      lng: 9.992304,
    });
    expect(result.visits[0]).toMatchObject({
      placeId: "ChIJold",
      startTimeMs: 1_773_226_400_000,
      endTimeMs: 1_773_237_200_000,
    });
  });

  it("derives probability from locationConfidence", () => {
    expect(result.visits[0].sourceProbability).toBeCloseTo(0.825);
  });
});

describe("parseTimeline rejects invalid input", () => {
  it.each([null, undefined, 42, "nope", {}, []])(
    "throws for %p",
    (value: unknown) => {
      expect(() => parseTimeline(value)).toThrow(/Timeline export/i);
    },
  );
});
