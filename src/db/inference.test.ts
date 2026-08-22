import { afterEach, describe, expect, it } from "vitest";
import {
  disposeTestDb,
  openTestDb,
} from "@/test/testDb";
import {
  createDeclaredTrip,
  dismissInferredTrip,
  getDismissedTripRanges,
  rerunTripInference,
  runTripInference,
  setHomePlace,
} from "@/db/repo";

let db = openTestDb("inference");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("inference");
});

const HOME_ID = "ChIJhome";
const FAR_ID = "ChIJfar";

async function seedWorld(): Promise<void> {
  await db.places.bulkPut([
    {
      id: HOME_ID,
      name: "Homebase",
      address: "",
      lat: 0,
      lng: 0,
      isHome: 1,
      createdAt: 0,
    },
    {
      id: FAR_ID,
      name: "Far Highlands",
      address: "",
      lat: 0.55,
      lng: 0,
      isHome: 0,
      createdAt: 0,
    },
  ]);
  await db.visits.bulkAdd([
    {
      dedupeKey: `${HOME_ID}:1`,
      placeId: HOME_ID,
      startTimeMs: Date.parse("2026-03-01T09:00:00"),
      endTimeMs: Date.parse("2026-03-12T08:00:00"),
      importId: null,
      createdAt: 0,
    },
    {
      dedupeKey: `${FAR_ID}:2`,
      placeId: FAR_ID,
      startTimeMs: Date.parse("2026-03-12T15:00:00"),
      endTimeMs: Date.parse("2026-03-19T08:00:00"),
      importId: null,
      createdAt: 0,
    },
  ]);
}

describe("runTripInference", () => {
  it("mints an inferred trip spanning the away window", async () => {
    await seedWorld();
    const created = await runTripInference();
    expect(created).toBe(1);
    const trips = await db.trips.toArray();
    expect(trips[0]).toMatchObject({
      provenance: "inferred",
      startDay: "2026-03-12",
      endDay: "2026-03-19",
    });
  });

  it("is a silent no-op without Home and idempotent with it", async () => {
    await seedWorld();
    await db.places.update(HOME_ID, { isHome: 0 });
    expect(await runTripInference()).toBe(0);

    await setHomePlace(HOME_ID);
    expect(await runTripInference()).toBe(1);
    expect(await runTripInference()).toBe(0);
  });

  it("declared trips are never modified or duplicated by inference", async () => {
    await seedWorld();
    await createDeclaredTrip("User-made", "2026-03-14", "2026-03-16");
    const created = await runTripInference();
    const declared = await db.trips.where("provenance").equals("declared").toArray();
    expect(declared.map((t) => [t.name, t.startDay, t.endDay])).toEqual([
      ["User-made", "2026-03-14", "2026-03-16"],
    ]);
    const inferred = (await db.trips.where("provenance").equals("inferred").toArray()).sort(
      (a, b) => a.startDay.localeCompare(b.startDay),
    );
    expect(created).toBe(inferred.length);
    expect(inferred.map((t) => [t.startDay, t.endDay])).toEqual([
      ["2026-03-12", "2026-03-13"],
      ["2026-03-17", "2026-03-19"],
    ]);
  });
});

describe("dismissed ranges survive re-imports", () => {
  it("deleted inferred trips stay gone across re-runs and new imports", async () => {
    await seedWorld();
    await runTripInference();
    const trip = (await db.trips.toArray())[0];
    await dismissInferredTrip(trip.id);

    expect((await db.trips.count()) === 0).toBe(true);
    expect(await getDismissedTripRanges()).toEqual([
      { startDay: "2026-03-12", endDay: "2026-03-19" },
    ]);

    // A fresh import overlapping the dismissed dates cannot resurrect it.
    await runTripInference();
    expect(await db.trips.count()).toBe(0);

    // An explicit re-run honours the dismissal too.
    await rerunTripInference();
    expect(await db.trips.count()).toBe(0);
  });

  it("re-run regenerates non-dismissed windows but never declared ones", async () => {
    await seedWorld();
    await runTripInference();
    await dismissInferredTrip((await db.trips.toArray())[0].id);

    // New away data in a different window.
    await db.visits.add({
      dedupeKey: `${FAR_ID}:3`,
      placeId: FAR_ID,
      startTimeMs: Date.parse("2026-07-02T10:00:00"),
      endTimeMs: Date.parse("2026-07-05T10:00:00"),
      importId: null,
      createdAt: 0,
    });
    await createDeclaredTrip("Declared stays", "2026-07-04", "2026-07-10");

    await rerunTripInference();
    const trips = (await db.trips.toArray()).sort((a, b) =>
      a.startDay.localeCompare(b.startDay),
    );
    expect(trips.map((t) => [t.provenance, t.startDay, t.endDay])).toEqual([
      ["inferred", "2026-07-02", "2026-07-03"],
      ["declared", "2026-07-04", "2026-07-10"],
    ]);
  });
});
