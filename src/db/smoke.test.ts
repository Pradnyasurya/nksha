import { afterEach, describe, expect, it } from "vitest";
import {
  disposeTestDb,
  openTestDb,
  reopenTestDb,
} from "@/test/testDb";
import type { Place, Trip, Visit } from "@/db/schema";

let db = openTestDb("smoke");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("smoke");
});

const place: Place = {
  id: "ChIJgUbEo1",
  name: "Old Manali",
  address: "Manali, Himachal Pradesh",
  lat: 32.2396,
  lng: 77.1887,
  isHome: 0,
  createdAt: 1_700_000_000_000,
};

const visit: Visit = {
  dedupeKey: `${place.id}:1731320400000`,
  placeId: place.id,
  startTimeMs: 1_731_320_400_000,
  endTimeMs: 1_731_406_800_000,
  importId: "import-1",
  createdAt: 1_700_000_001_000,
};

const trip: Trip = {
  id: "trip-1",
  name: "Himachal, Mar 12–19",
  startDay: "2024-03-12",
  endDay: "2024-03-19",
  provenance: "declared",
  createdAt: 1_700_000_002_000,
};

describe("walking skeleton persistence", () => {
  it("round-trips all five tables across a simulated reload", async () => {
    await db.places.put(place);
    await db.visits.add(visit);
    await db.trips.put(trip);
    await db.imports.put({
      id: "import-1",
      fileName: "Timeline.json",
      importedAt: 1_700_000_003_000,
      placesFound: 1,
      visitsCreated: 1,
      visitsSkipped: 0,
      firstVisitTimeMs: visit.startTimeMs,
      lastVisitTimeMs: visit.endTimeMs!,
    });
    await db.settings.put({ key: "probe", value: { nested: true } });

    const reopened = await reopenTestDb(db);
    db = reopened;
    expect(await reopened.places.get(place.id)).toEqual(place);
    const readVisit = await reopened.visits.get({ dedupeKey: visit.dedupeKey });
    expect(readVisit).toMatchObject({
      placeId: place.id,
      startTimeMs: visit.startTimeMs,
      endTimeMs: visit.endTimeMs,
    });
    expect(await reopened.trips.get(trip.id)).toEqual(trip);
    expect(await reopened.imports.get("import-1")).toMatchObject({
      fileName: "Timeline.json",
      visitsCreated: 1,
    });
    expect(await reopened.settings.get("probe")).toEqual({
      key: "probe",
      value: { nested: true },
    });
  });

  it("rejects a second visit with the same dedupe key", async () => {
    await db.visits.add(visit);
    await expect(db.visits.add({ ...visit, placeId: "other" })).rejects.toThrow(
      /ConstraintError|duplicate/i,
    );
  });

  it("keeps exactly one Home flag", async () => {
    const other: Place = { ...place, id: "ChIJother" };
    await db.places.bulkPut([place, other]);
    await db.transaction("rw", db.places, async () => {
      await db.places.where("isHome").equals(1).modify({ isHome: 0 });
      await db.places.update(other.id, { isHome: 1 });
    });
    const reopened = await reopenTestDb(db);
    const homes = await reopened.places.where("isHome").equals(1).toArray();
    expect(homes.map((p) => p.id)).toEqual(["ChIJother"]);
  });
});
