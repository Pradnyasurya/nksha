import { afterEach, describe, expect, it } from "vitest";
import {
  disposeTestDb,
  openTestDb,
} from "@/test/testDb";
import {
  createDeclaredTrip,
  deleteTrip,
  renameTrip,
} from "@/db/repo";

let db = openTestDb("trips");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("trips");
});

describe("declared trip lifecycle", () => {
  it("creates a declared trip and derives nothing per-visit", async () => {
    const trip = await createDeclaredTrip("Himachal", "2026-03-12", "2026-03-19");
    expect(trip).toMatchObject({
      name: "Himachal",
      startDay: "2026-03-12",
      endDay: "2026-03-19",
      provenance: "declared",
    });
    expect((await db.trips.get(trip.id))!.name).toBe("Himachal");
  });

  it("rejects overlapping windows naming the conflict", async () => {
    await createDeclaredTrip("First", "2026-03-10", "2026-03-14");
    await expect(
      createDeclaredTrip("Second", "2026-03-14", "2026-03-20"),
    ).rejects.toThrow(/overlaps "First"/i);
    await expect(db.trips.count()).resolves.toBe(1);
  });

  it("allows strictly adjacent windows", async () => {
    await createDeclaredTrip("First", "2026-03-10", "2026-03-14");
    await expect(
      createDeclaredTrip("Second", "2026-03-15", "2026-03-20"),
    ).resolves.toMatchObject({ provenance: "declared" });
  });

  it("renames in place without touching windows or provenance", async () => {
    const trip = await createDeclaredTrip("Typo Name", "2026-05-01", "2026-05-02");
    await renameTrip(trip.id, "Fixed Name");
    expect(await db.trips.get(trip.id)).toMatchObject({
      name: "Fixed Name",
      startDay: "2026-05-01",
      provenance: "declared",
    });
  });

  it("deletes stay gone", async () => {
    const trip = await createDeclaredTrip("Ephemeral", "2026-06-01", "2026-06-02");
    await deleteTrip(trip.id);
    expect(await db.trips.get(trip.id)).toBeUndefined();
  });
});
