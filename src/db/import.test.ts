import { afterEach, describe, expect, it } from "vitest";
import {
  disposeTestDb,
  openTestDb,
} from "@/test/testDb";
import { insertImportBundle } from "@/db/repo";
import { parseTimeline } from "@/features/import/parse";
import type { ParsedTimeline } from "@/features/import/parse";

let db = openTestDb("import");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("import");
});

function bundleFor(parsed: ParsedTimeline, importId: string) {
  return {
    importRecord: {
      id: importId,
      fileName: `${importId}.json`,
      importedAt: 1_800_000_000_000 + Number(importId.slice(-1)) * 1000,
      placesFound: parsed.places.length,
    },
    places: parsed.places.map((p) => ({
      ...p,
      isHome: 0 as const,
      createdAt: 1_800_000_000_000,
    })),
    visits: parsed.visits.map((v) => ({
      ...v,
      importId,
      createdAt: 1_800_000_000_000,
    })),
    movements: parsed.movements.map((m) => ({
      ...m,
      importId,
      createdAt: 1_800_000_000_000,
    })),
  };
}

const FILE_A = {
  semanticSegments: [
    {
      startTime: "2026-03-12T10:00:00Z",
      endTime: "2026-03-12T13:00:00Z",
      visit: {
        topCandidate: {
          placeId: "ChIJcafe",
          placeLocation: { latLng: "32.2396°, 77.1887°" },
        },
      },
    },
    {
      startTime: "2026-03-12T14:00:00Z",
      endTime: "2026-03-12T16:00:00Z",
      visit: {
        topCandidate: {
          placeId: "ChIJpark",
          placeLocation: { latLng: "32.2432°, 77.1892°" },
        },
      },
    },
  ],
};

const FILE_B_OVERLAPPING = {
  semanticSegments: [
    {
      startTime: "2026-03-12T10:00:00Z",
      endTime: "2026-03-12T13:30:00Z",
      visit: {
        topCandidate: {
          placeId: "ChIJcafe",
          placeLocation: { latLng: "32.2396°, 77.1887°" },
        },
      },
    },
    {
      startTime: "2026-03-12T18:00:00Z",
      visit: {
        topCandidate: {
          placeId: "ChIJmarket",
          placeLocation: { latLng: "32.2370°, 77.1910°" },
        },
      },
    },
  ],
};

describe("insertImportBundle", () => {
  it("reports what an import created", async () => {
    const outcome = await insertImportBundle(
      bundleFor(parseTimeline(FILE_A), "imp-a"),
    );
    expect(outcome).toMatchObject({
      visitsCreated: 2,
      visitsSkipped: 0,
      firstVisitTimeMs: Date.parse("2026-03-12T10:00:00Z"),
      lastVisitTimeMs: Date.parse("2026-03-12T16:00:00Z"),
    });
  });

  it("re-importing an identical file yields zero new rows", async () => {
    await insertImportBundle(bundleFor(parseTimeline(FILE_A), "imp-a"));
    const again = await insertImportBundle(
      bundleFor(parseTimeline(FILE_A), "imp-a2"),
    );
    expect(again.visitsCreated).toBe(0);
    expect(again.visitsSkipped).toBe(2);
    const total = await db.visits.count();
    expect(total).toBe(2);
  });

  it("overlapping import inserts only genuinely new visits", async () => {
    await insertImportBundle(bundleFor(parseTimeline(FILE_A), "imp-a"));
    const outcome = await insertImportBundle(
      bundleFor(parseTimeline(FILE_B_OVERLAPPING), "imp-b"),
    );
    expect(outcome.visitsCreated).toBe(1);
    expect(outcome.visitsSkipped).toBe(1);

    const cafe = await db.visits.where("dedupeKey").startsWith("ChIJcafe:").toArray();
    expect(cafe).toHaveLength(1);
    expect(cafe[0].endTimeMs).toBe(Date.parse("2026-03-12T13:00:00Z"));
    const market = await db.visits
      .where("dedupeKey")
      .startsWith("ChIJmarket:")
      .toArray();
    expect(market).toHaveLength(1);
  });

  it("never touches manual records", async () => {
    await db.places.put({
      id: "manual:x1",
      name: "Hand-added hut",
      address: "",
      lat: 32.1,
      lng: 77.2,
      isHome: 0,
      createdAt: 1,
    });
    await insertImportBundle(bundleFor(parseTimeline(FILE_A), "imp-a"));
    const manual = await db.places.get("manual:x1");
    expect(manual).toMatchObject({ name: "Hand-added hut" });
  });
});

const FILE_WITH_ACTIVITY = {
  semanticSegments: [
    {
      startTime: "2026-03-12T10:00:00Z",
      endTime: "2026-03-12T13:00:00Z",
      visit: {
        topCandidate: {
          placeId: "ChIJcafe",
          placeLocation: { latLng: "32.2396°, 77.1887°" },
        },
      },
    },
    {
      startTime: "2026-03-12T13:30:00Z",
      endTime: "2026-03-12T14:30:00Z",
      activity: {
        start: { latLng: "32.2396°, 77.1887°" },
        end: { latLng: "32.2432°, 77.1892°" },
        distanceMeters: 4200,
        activityType: "WALKING",
      },
    },
  ],
};

describe("insertImportBundle movements (#11)", () => {
  it("stores activity segments alongside visits", async () => {
    const outcome = await insertImportBundle(
      bundleFor(parseTimeline(FILE_WITH_ACTIVITY), "imp-m1"),
    );
    expect(outcome.movementsCreated).toBe(1);
    expect(await db.movements.toArray()).toMatchObject([
      { mode: "walking", distanceMeters: 4200 },
    ]);
  });

  it("never duplicates movements across overlapping imports", async () => {
    await insertImportBundle(bundleFor(parseTimeline(FILE_WITH_ACTIVITY), "imp-m1"));
    const again = await insertImportBundle(
      bundleFor(parseTimeline(FILE_WITH_ACTIVITY), "imp-m2"),
    );
    expect(again.movementsCreated).toBe(0);
    expect(again.movementsSkipped).toBe(1);
    expect(await db.movements.count()).toBe(1);
  });
});
