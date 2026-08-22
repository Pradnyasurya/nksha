import { afterEach, describe, expect, it } from "vitest";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  buildArchive,
  parseArchive,
  restoreArchive,
  serializeArchive,
} from "@/features/archive/archive";
import { openTestDb, disposeTestDb } from "@/test/testDb";
import type { Movement, Place, Visit } from "@/db/schema";
import {
  addDismissedVisitKeys,
  createDeclaredTrip,
  dismissInferredTrip,
  getBasemapStyle,
  getDismissedTripRanges,
  getDismissedVisitKeys,
  getManualCountries,
  insertImportBundle,
  rerunTripInference,
  setBasemapStyle,
  setHomePlace,
  tripsByStart,
} from "@/db/repo";
import { addManualCountry } from "@/db/repo";

let db = openTestDb("archive");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("archive");
});

const T = (iso: string) => Date.parse(iso);

function place(id: string, lat: number, lng: number, isHome: 0 | 1 = 0): Place {
  return { id, name: `Name ${id}`, address: "", lat, lng, isHome, createdAt: T("2026-01-01T00:00:00") };
}

function visit(
  id: number,
  placeId: string,
  startIso: string,
  endIso: string | null,
): Visit {
  return {
    id,
    dedupeKey: `${placeId}:${T(startIso)}`,
    placeId,
    startTimeMs: T(startIso),
    endTimeMs: endIso === null ? null : T(endIso),
    importId: "imp-seed",
    createdAt: T("2026-01-01T00:00:00"),
  };
}

function movement(id: number, mode: Movement["mode"], meters: number): Movement {
  return {
    id,
    dedupeKey: `act:${mode}:${id}`,
    mode,
    startTimeMs: T("2026-03-12T09:00:00"),
    endTimeMs: T("2026-03-12T11:00:00"),
    distanceMeters: meters,
    importId: "imp-seed",
    createdAt: T("2026-01-01T00:00:00"),
  };
}

/** Home at the equator; the hut ~61 km north — outside the away radius. */
async function seedRichData(): Promise<void> {
  await insertImportBundle({
    importRecord: {
      id: "imp-seed",
      fileName: "timeline.json",
      importedAt: T("2026-01-02T00:00:00"),
      placesFound: 2,
    },
    places: [place("ChIJhome", 0, 0), place("ChIJhut", 0.55, 0)],
    visits: [
      visit(1, "ChIJhome", "2026-03-10T10:00:00", "2026-03-12T09:00:00"),
      visit(2, "ChIJhut", "2026-03-12T09:00:00", null),
    ],
    movements: [
      movement(1, "driving", 42_000),
      movement(2, "walking", 3_500),
    ],
  });
  await setHomePlace("ChIJhome");
  await setBasemapStyle("light");
  await addManualCountry("CHE");
  await addDismissedVisitKeys(["ChIJcafe:1700000000000"]);

  const created = await rerunTripInference();
  expect(created).toBe(1);
  const inferred = (await tripsByStart()).find((t) => t.provenance === "inferred")!;
  await dismissInferredTrip(inferred.id);

  await createDeclaredTrip("Staycation", "2026-06-01", "2026-06-05");
}

describe("archive round-trip (#12)", () => {
  it("export → wipe → restore reproduces byte-equivalent domain data", async () => {
    await seedRichData();
    const original = await buildArchive();
    const json = serializeArchive(original);

    // Simulate a lost device: fresh empty storage.
    await disposeTestDb(db);
    db = openTestDb("archive-restored");

    const outcome = await restoreArchive(parseArchive(JSON.parse(json)));
    expect(outcome).toEqual({
      places: 2,
      visits: 2,
      movements: 2,
      trips: 1,
      imports: 1,
    });

    const restored = await buildArchive();
    // exportedAt is metadata; every domain table must match byte-for-byte.
    expect(JSON.stringify(restored.places)).toEqual(JSON.stringify(original.places));
    expect(JSON.stringify(restored.visits)).toEqual(JSON.stringify(original.visits));
    expect(JSON.stringify(restored.movements)).toEqual(JSON.stringify(original.movements));
    expect(JSON.stringify(restored.trips)).toEqual(JSON.stringify(original.trips));
    expect(JSON.stringify(restored.imports)).toEqual(JSON.stringify(original.imports));
    expect(JSON.stringify(restored.settings)).toEqual(JSON.stringify(original.settings));
    expect(restored.dismissedTripRanges).toEqual(original.dismissedTripRanges);
    expect(restored.dismissedVisitKeys).toEqual(original.dismissedVisitKeys);
    void json;
  });

  it("restores settings and dismissal memories readably", async () => {
    await seedRichData();
    const json = serializeArchive(await buildArchive());
    await disposeTestDb(db);
    db = openTestDb("archive-settings");
    await restoreArchive(parseArchive(JSON.parse(json)));

    expect(await getBasemapStyle()).toBe("light");
    expect(await getManualCountries()).toEqual(["CHE"]);
    expect([...(await getDismissedVisitKeys())]).toEqual([
      "ChIJcafe:1700000000000",
    ]);
    const ranges = await getDismissedTripRanges();
    expect(ranges.length).toBeGreaterThan(0);
  });

  it("keeps trip inference and import dedup behaving identically post-restore", async () => {
    await seedRichData();
    const dismissedBefore = await getDismissedTripRanges();
    const json = serializeArchive(await buildArchive());

    await disposeTestDb(db);
    db = openTestDb("archive-behaviour");
    await restoreArchive(parseArchive(JSON.parse(json)));

    // Re-importing the same file under a new import id dedupes by key…
    const outcome = await insertImportBundle({
      importRecord: {
        id: "imp-second",
        fileName: "timeline.json",
        importedAt: T("2026-07-01T00:00:00"),
        placesFound: 2,
      },
      places: [place("ChIJhome", 0, 0), place("ChIJhut", 0.55, 0)],
      visits: [
        visit(101, "ChIJhome", "2026-03-10T10:00:00", "2026-03-12T09:00:00"),
        visit(102, "ChIJhut", "2026-03-12T09:00:00", "2026-03-19T18:00:00"),
      ],
      movements: [],
    });
    expect(outcome.visitsCreated).toBe(0);
    expect(outcome.visitsSkipped).toBe(2);

    // …and the dismissed range still blocks resurrection of that trip.
    const created = await rerunTripInference();
    expect(created).toBe(0);
    const dismissedAfter = await getDismissedTripRanges();
    expect(dismissedAfter).toEqual(dismissedBefore);
    const remaining = await tripsByStart();
    expect(remaining.map((t) => t.provenance)).toEqual(["declared"]);
  });

  it("pretty-prints human-readable output", async () => {
    await seedRichData();
    const json = serializeArchive(await buildArchive());
    expect(json.startsWith("{\n  \"format\":")).toBe(true);
    expect(json.endsWith("}\n")).toBe(true);
    expect(json).toContain("\n      \"dedupeKey\"");
  });

  it("merges into existing data instead of wiping it", async () => {
    await seedRichData();
    const json = serializeArchive(await buildArchive());
    await disposeTestDb(db);
    db = openTestDb("archive-merge");

    // A device with its own life already on it:
    await insertImportBundle({
      importRecord: {
        id: "imp-other",
        fileName: "other.json",
        importedAt: T("2026-08-01T00:00:00"),
        placesFound: 1,
      },
      places: [place("ChIJlocal", 10, 10)],
      visits: [],
      movements: [],
    });

    const outcome = await restoreArchive(parseArchive(JSON.parse(json)));
    expect(outcome.places).toBe(2);
    const ids = (await db.places.toArray()).map((p) => p.id).sort();
    expect(ids).toEqual(["ChIJhome", "ChIJhut", "ChIJlocal"]);
  });
});

describe("parseArchive rejects bad input clearly (#12)", () => {
  it.each([
    ["not an object at all", "nope"],
    ["an empty object", {}],
    ["a Timeline export by mistake", { semanticSegments: [] }],
    ["the wrong format tag", { format: "some-other-backup", version: 1 }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseArchive(value)).toThrow(/nksha archive|not an/i);
  });

  it("rejects unknown future versions with an upgrade hint", () => {
    expect(() =>
      parseArchive({ format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION + 3 }),
    ).toThrow(/newer.*update nksha first/i);
  });

  it("rejects non-integer versions", () => {
    expect(() =>
      parseArchive({ format: ARCHIVE_FORMAT, version: "one" }),
    ).toThrow(/no readable format version/i);
  });

  it("rejects damaged archives missing a section", () => {
    expect(() =>
      parseArchive({ format: ARCHIVE_FORMAT, version: 1, places: [], visits: [] }),
    ).toThrow(/damaged.*movements/i);
  });
});
