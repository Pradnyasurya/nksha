import { afterEach, describe, expect, it } from "vitest";
import {
  disposeTestDb,
  openTestDb,
} from "@/test/testDb";
import { renamePlace, setHomePlace } from "@/db/repo";
import type { Place } from "@/db/schema";

let db = openTestDb("rename");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("rename");
});

const place: Place = {
  id: "ChIJhut",
  name: "Old name",
  address: "Somewhere 5",
  lat: 32.2,
  lng: 77.1,
  isHome: 0,
  createdAt: 0,
};

describe("renamePlace", () => {
  it("updates the single canonical record; visits reflect it via placeId", async () => {
    await db.places.put(place);
    await db.visits.bulkAdd([
      {
        dedupeKey: `${place.id}:1000`,
        placeId: place.id,
        startTimeMs: 1000,
        endTimeMs: 2000,
        importId: null,
        createdAt: 0,
      },
      {
        dedupeKey: `${place.id}:3000`,
        placeId: place.id,
        startTimeMs: 3000,
        endTimeMs: null,
        importId: null,
        createdAt: 0,
      },
    ]);

    await renamePlace(place.id, "Mountain hut", "New address 7");

    const renamed = await db.places.get(place.id);
    expect(renamed).toMatchObject({
      name: "Mountain hut",
      address: "New address 7",
      lat: 32.2,
    });

    const visits = await db.visits.where("placeId").equals(place.id).toArray();
    expect(visits).toHaveLength(2);
    for (const v of visits) {
      const joined = await db.places.get(v.placeId);
      expect(joined!.name).toBe("Mountain hut");
    }
  });

  it("leaves other places untouched and preserves the Home flag", async () => {
    const other = { ...place, id: "ChIJother", name: "Other" };
    await db.places.bulkPut([place, other]);
    await setHomePlace(other.id);

    await renamePlace(place.id, "Renamed");

    expect((await db.places.get(place.id))!.name).toBe("Renamed");
    expect((await db.places.get(other.id))!.name).toBe("Other");
    expect((await db.places.get(other.id))!.isHome).toBe(1);
  });

  it("rejects unknown places", async () => {
    await expect(renamePlace("nope", "X")).rejects.toThrow(/Unknown place/);
  });
});
