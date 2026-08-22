import { afterEach, describe, expect, it } from "vitest";
import {
  disposeTestDb,
  openTestDb,
  reopenTestDb,
} from "@/test/testDb";
import {
  getBasemapStyle,
  getCustomStyleUrl,
  setBasemapStyle,
  setCustomStyleUrl,
} from "@/db/repo";

let db = openTestDb("settings");

afterEach(async () => {
  await disposeTestDb(db);
  db = openTestDb("settings");
});

describe("style preference persistence", () => {
  it("defaults to dark before any preference is stored", async () => {
    expect(await getBasemapStyle()).toBe("dark");
    expect(await getCustomStyleUrl()).toBe("");
  });

  it("persists the style choice across a hard reload", async () => {
    await setBasemapStyle("light");
    db = await reopenTestDb(db);
    expect(await getBasemapStyle()).toBe("light");
  });

  it("persists a custom style URL across a hard reload", async () => {
    await setCustomStyleUrl("user-style.json");
    db = await reopenTestDb(db);
    expect(await getCustomStyleUrl()).toBe("user-style.json");
  });
});
