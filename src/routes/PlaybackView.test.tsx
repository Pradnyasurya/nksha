import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlaybackView from "@/routes/PlaybackView";
import { openTestDb, disposeTestDb } from "@/test/testDb";
import type { Map as MaplibreMap } from "maplibre-gl";

// MapLibre cannot run in jsdom — stub the map to a no-op object. The view
// only needs the ref lifecycle and its own DOM to test focus behavior.
vi.mock("maplibre-gl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("maplibre-gl")>();
  const FakeMap = class {
    on() {}
    once() {}
    off() {}
    addControl() {}
    remove() {}
    getCanvas() {
      return { style: {} };
    }
    getCenter() { return { lng: 0, lat: 0 }; }
    getZoom() { return 0; }
    getBearing() { return 0; }
    getPitch() { return 0; }
    jumpTo() {}
    fitBounds() {}
    setStyle() {}
    loaded() { return true; }
    getSource() { return null; }
  } as unknown as typeof MaplibreMap;
  return { ...actual, Map: FakeMap, NavigationControl: class {} };
});

vi.mock("@/features/playback/mapLayers", () => ({
  ensurePlaybackLayers: () => {},
  setRouteData: () => {},
  setPinData: () => {},
  applyPinVisibility: () => {},
  applyDot: () => {},
  waitForRender: async () => {},
}));

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/playback"]}>
      <PlaybackView />
    </MemoryRouter>,
  );
}

async function seedData(dbName: string): Promise<unknown> {
  const db = openTestDb(dbName);
  await db.places.bulkPut([
    { id: "p1", name: "Home", address: "", lat: 10, lng: 10, isHome: 1, createdAt: 0 },
    { id: "p2", name: "Far Cafe", address: "", lat: 11, lng: 11, isHome: 0, createdAt: 0 },
  ]);
  await db.visits.bulkAdd([
    { dedupeKey: "p1:100", placeId: "p1", startTimeMs: Date.UTC(2026, 0, 1, 9), endTimeMs: Date.UTC(2026, 0, 1, 17), importId: null, createdAt: 0 },
    { dedupeKey: "p2:200", placeId: "p2", startTimeMs: Date.UTC(2026, 0, 2, 9), endTimeMs: Date.UTC(2026, 0, 3, 9), importId: null, createdAt: 0 },
  ]);
  return db;
}

describe("PlaybackView story title card (#a11y)", () => {
  afterEach(() => cleanup());

  it("focuses Begin the trip and keeps covered controls unfocusable", async () => {
    const db = (await seedData("playback-focus")) as never;
    renderView();
    // The title card appears and takes focus.
    const begin = await screen.findByRole("button", { name: /Begin the trip/ });
    await waitFor(() => expect(document.activeElement).toBe(begin));

    // Controls behind the card sit inside an inert container — keyboard
    // and assistive tech cannot reach them while the card is up.
    const controls = screen.getByRole("button", { name: /Play|Pause/ }).closest(
      "div[inert]",
    );
    expect(controls).toBeTruthy();
    // The lean transport keeps the secondary controls behind "More options".
    expect(controls!.textContent).toContain("More options");
    expect(controls!.querySelector('[aria-label="Scrub through time"]')).toBeTruthy();
    await disposeTestDb(db);
  });

  it("keeps secondary controls behind a More options toggle", async () => {
    const db = (await seedData("playback-secondary")) as never;
    renderView();
    await screen.findByRole("button", { name: /Begin the trip/ });
    fireEvent.click(screen.getByRole("button", { name: /Begin the trip/ }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Begin the trip/ })).toBeNull(),
    );
    // The transport stays lean: speed and export live in the secondary panel.
    expect(screen.queryByLabelText("Playback speed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByLabelText("Playback speed")).toBeTruthy();
    expect(screen.getByText("Export MP4")).toBeTruthy();
    await disposeTestDb(db);
  });

  it("moves focus to the play control after the story begins", async () => {
    const db = (await seedData("playback-begin")) as never;
    renderView();
    const begin = await screen.findByRole("button", { name: /Begin the trip/ });
    await waitFor(() => expect(document.activeElement).toBe(begin));
    fireEvent.click(begin);

    // Title card gone; playback starts; focus moves to the Pause control.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Begin the trip/ })).toBeNull(),
    );
    await waitFor(() => {
      const active = document.activeElement;
      expect(active?.tagName).toBe("BUTTON");
      expect(active?.textContent).toMatch(/Pause/);
    });
    await disposeTestDb(db);
  });
});
