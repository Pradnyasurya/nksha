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

const ACTIVITY_FORMAT = {
  semanticSegments: [
    {
      startTime: "2026-04-01T08:00:00Z",
      endTime: "2026-04-01T09:30:00Z",
      activity: {
        start: { latLng: "28.1000°, 77.1000°" },
        end: { latLng: "28.3000°, 77.3000°" },
        distanceMeters: "12345.5",
        activityType: "IN_BUS",
      },
    },
    {
      startTime: "2026-04-01T10:00:00Z",
      endTime: "2026-04-01T10:20:00Z",
      activity: {
        start: { latLng: "28.3000°, 77.3000°" },
        end: { latLng: "28.3100°, 77.3100°" },
        distance: 1500,
        topCandidate: { type: "WALKING", probability: 0.9 },
      },
    },
    {
      startTime: "2026-04-01T11:00:00Z",
      endTime: "2026-04-01T12:00:00Z",
      activity: { activityType: "AWAY_FROM_DEVICE" },
    },
  ],
};

const LEGACY_ACTIVITY_FORMAT = {
  timelineObjects: [
    {
      activitySegment: {
        startLocation: { latitudeE7: 281000000, longitudeE7: 771000000 },
        endLocation: { latitudeE7: 283000000, longitudeE7: 773000000 },
        duration: {
          startTimestampMs: "1773226400000",
          endTimestampMs: "1773230000000",
        },
        distance: 42424,
        activityType: "IN_PASSENGER_VEHICLE",
      },
    },
  ],
};

describe("parseTimeline movements (semantic activity)", () => {
  const result = parseTimeline(ACTIVITY_FORMAT);

  it("collects one Movement per activity segment with a normalized mode", () => {
    expect(result.movements).toHaveLength(2);
    expect(result.movements[0]).toMatchObject({
      mode: "transit",
      distanceMeters: 12345.5,
      startLat: 28.1,
      endLat: 28.3,
      dedupeKey: expect.stringMatching(/^act:transit:/),
    });
    expect(result.movements[0].startTimeMs).toBe(
      Date.parse("2026-04-01T08:00:00Z"),
    );
    expect(result.movements[0].endTimeMs).toBe(
      Date.parse("2026-04-01T09:30:00Z"),
    );
  });

  it("reads mode from topCandidate.type when activityType is absent", () => {
    expect(result.movements[1].mode).toBe("walking");
  });

  it("skips activities without a usable mode without failing the import", () => {
    expect(result.skippedSegments).toBe(1);
  });
});

describe("parseTimeline movements (legacy activitySegment)", () => {
  const result = parseTimeline(LEGACY_ACTIVITY_FORMAT);

  it("maps E7 endpoints, ms timestamps, and metres distance", () => {
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0]).toMatchObject({
      mode: "driving",
      distanceMeters: 42424,
      startTimeMs: 1_773_226_400_000,
      endTimeMs: 1_773_230_000_000,
      startLat: 28.1,
      startLng: 77.1,
      endLat: 28.3,
      endLng: 77.3,
    });
  });

  it("is deterministic for identical input", () => {
    expect(parseTimeline(LEGACY_ACTIVITY_FORMAT)).toEqual(result);
  });
});

const IOS_EXPORT = [
  {
    startTime: "2026-03-12T18:14:00.109+05:30",
    endTime: "2026-03-13T06:06:39.035+05:30",
    activity: {
      probability: "0.965136",
      end: "geo:-12.345600,56.789000",
      topCandidate: {
        type: "in passenger vehicle",
        probability: "0.586533",
      },
      distanceMeters: "95870.460938",
      start: "geo:-12.300000,56.700000",
    },
  },
  {
    startTime: "2026-03-13T06:06:39.035+05:30",
    endTime: "2026-03-15T16:38:37.540+05:30",
    visit: {
      hierarchyLevel: "0",
      topCandidate: {
        probability: "0.343355",
        semanticType: "Home",
        placeID: "ChIJioshome",
        placeLocation: "geo:-13.100000,57.200000",
      },
      probability: "0.745908",
    },
    timelinePath: [
      { point: "geo:-13.099900,57.199800", durationMinutesOffsetFromStartTime: "8" },
      { point: "geo:-13.101000,57.202000", durationMinutesOffsetFromStartTime: "21" },
    ],
  },
  {
    startTime: "2026-03-15T16:38:37.540+05:30",
    visit: {
      topCandidate: {
        placeID: "ChIJioswork",
        placeLocation: "geo:-13.500000,57.500000",
      },
    },
  },
  {
    endTime: "2026-03-16T11:00:00.000Z",
    startTime: "2026-03-16T09:00:00.000Z",
    timelinePath: [
      { point: "geo:-13.400000,57.400000", durationMinutesOffsetFromStartTime: "0" },
    ],
  },
];

describe("parseTimeline (iOS app export format)", () => {
  const result = parseTimeline(IOS_EXPORT);

  it("accepts the bare segment array as the root", () => {
    expect(result.visits).toHaveLength(2);
    expect(result.movements).toHaveLength(1);
  });

  it("reads geo: coordinates and placeID casing", () => {
    expect(result.places[0]).toEqual({
      id: "ChIJioshome",
      name: "",
      address: "",
      lat: -13.1,
      lng: 57.2,
    });
    const work = result.places.find((p) => p.id === "ChIJioswork")!;
    expect(work).toMatchObject({ lat: -13.5, lng: 57.5 });
  });

  it("parses string-typed probabilities into numbers", () => {
    const homeVisit = result.visits.find((v) =>
      v.dedupeKey.startsWith("ChIJioshome:"),
    )!;
    expect(homeVisit.sourceProbability).toBeCloseTo(0.343355, 6);
  });

  it("attaches timelinePath breadcrumbs with iOS offset keys", () => {
    const homeVisit = result.visits.find((v) =>
      v.dedupeKey.startsWith("ChIJioshome:"),
    )!;
    expect(homeVisit.timelinePath![1]).toEqual({
      lat: -13.101,
      lng: 57.202,
      offsetMinutes: 21,
    });
  });

  it("maps iOS activity wording onto movement modes", () => {
    expect(result.movements[0]).toMatchObject({
      mode: "driving",
      distanceMeters: 95870.460938,
      startLat: -12.3,
      endLng: 56.789,
    });
  });

  it("skips breadcrumb-only segments without failing", () => {
    expect(result.skippedSegments).toBe(1);
  });

  it("is deterministic for identical input", () => {
    expect(parseTimeline(IOS_EXPORT)).toEqual(result);
  });

  it("still rejects an empty array as unrecognisable", () => {
    expect(() => parseTimeline([])).toThrow(/Timeline export/i);
  });
});
