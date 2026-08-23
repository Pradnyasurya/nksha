import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeatmapView from "@/routes/HeatmapView";
import { openTestDb, disposeTestDb } from "@/test/testDb";
import type { Map as MaplibreMap } from "maplibre-gl";

vi.mock("maplibre-gl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("maplibre-gl")>();
  const FakeMap = class {
    on() {}
    once() {}
    off() {}
    addControl() {}
    remove() {}
    getSource() { return null; }
    addSource() {}
    addLayer() {}
    setPaintProperty() {}
    queryRenderedFeatures() { return []; }
    fitBounds() {}
    getCanvas() { return { style: {} }; }
    loaded() { return true; }
  } as unknown as typeof MaplibreMap;
  return { ...actual, Map: FakeMap, NavigationControl: class {} };
});

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/heatmap"]}>
      <HeatmapView />
    </MemoryRouter>,
  );
}

async function seedYear(dbName: string, years: number[]): Promise<unknown> {
  const db = openTestDb(dbName);
  let i = 0;
  for (const year of years) {
    await db.places.put({
      id: `p${year}`,
      name: `Place ${year}`,
      address: "",
      lat: 10 + i,
      lng: 10 + i,
      isHome: 0,
      createdAt: 0,
    });
    await db.visits.add({
      dedupeKey: `p${year}:100`,
      placeId: `p${year}`,
      startTimeMs: Date.UTC(year, 5, 1, 9),
      endTimeMs: Date.UTC(year, 5, 1, 18),
      importId: null,
      createdAt: 0,
    });
    i += 1;
  }
  return db;
}

describe("HeatmapView year controls (#heatmap-years)", () => {
  afterEach(() => cleanup());

  it("shows a plain year label instead of dead sliders for single-year data", async () => {
    const db = (await seedYear("heatmap-single", [2026])) as never;
    renderView();
    const label = await screen.findByTestId("heatmap-single-year");
    expect(label.textContent).toContain("2026");
    expect(screen.queryByRole("slider", { name: "From year" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "To year" })).toBeNull();
    await disposeTestDb(db);
  });

  it("offers presets and sliders only when at least two years exist", async () => {
    const db = (await seedYear("heatmap-multi", [2025, 2026])) as never;
    renderView();
    expect(
      await screen.findByRole("button", { name: "All time" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Last 12 months" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2025" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2026" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "From year" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "To year" })).toBeTruthy();
    expect(screen.queryByTestId("heatmap-single-year")).toBeNull();
    await disposeTestDb(db);
  });
});
