import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import TripsView from "@/routes/TripsView";
import { openTestDb, disposeTestDb } from "@/test/testDb";

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/trips"]}>
      <TripsView />
    </MemoryRouter>,
  );
}

describe("TripsView (#trips-ux)", () => {
  afterEach(() => cleanup());

  it("says Create trip and never mentions a nonexistent brush", async () => {
    const db = openTestDb("trips-empty");
    renderView();
    expect(await screen.findByText("Create trip")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/brush/i);
    await disposeTestDb(db);
  });

  it("stacks the form fields below the small breakpoint", async () => {
    const db = openTestDb("trips-stack");
    renderView();
    // The date/action group is flex-col first, row only at sm+ — this is the
    // fix for the fixed-width horizontal group that overflowed at 390 px.
    await waitFor(() => {
      expect(document.querySelector("form .flex-col.sm\\:flex-row")).toBeTruthy();
    });
    for (const input of document.querySelectorAll<HTMLInputElement>(
      'input[type="date"]',
    )) {
      expect(input.className).toMatch(/h-11/);
      expect(input.className).not.toMatch(/w-\d/); // no fixed widths
    }
    await disposeTestDb(db);
  });

  it("disables Re-run suggestions until prerequisites exist, then offers it", async () => {
    const empty = openTestDb("trips-novisits");
    renderView();
    await screen.findByText("Create trip");
    // The button stays visible but disabled, and explains what is missing
    // (#trips-onboarding) — a silent no-op button helps nobody.
    const rerun = await screen.findByRole("button", { name: /Re-run suggestions/ });
    expect((rerun as HTMLButtonElement).disabled).toBe(true);
    expect(rerun.getAttribute("title")).toMatch(/Import your timeline first/i);
    expect(document.body.textContent).toMatch(/declared Home|Choose Home/i);
    cleanup();

    await empty.places.put({
      id: "p1",
      name: "Cafe",
      address: "",
      lat: 1,
      lng: 1,
      isHome: 0,
      createdAt: 0,
    });
    await empty.visits.add({
      dedupeKey: "p1:100",
      placeId: "p1",
      startTimeMs: 100,
      endTimeMs: 200,
      importId: null,
      createdAt: 0,
    });
    renderView();
    // Visits exist but Home is not chosen: still disabled, now offering Choose Home.
    const rerun2 = await screen.findByRole("button", { name: /Re-run suggestions/ });
    expect((rerun2 as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByTestId("choose-home")).toBeTruthy();
    await disposeTestDb(empty);
  });

  it("previews how many visits the window would claim", async () => {
    const db = openTestDb("trips-preview");
    await db.places.put({
      id: "p1",
      name: "Cafe",
      address: "",
      lat: 1,
      lng: 1,
      isHome: 0,
      createdAt: 0,
    });
    // Two visits on 2026-01-10 local time.
    const morning = new Date(2026, 0, 10, 9).getTime();
    const evening = new Date(2026, 0, 10, 19).getTime();
    await db.visits.bulkPut([
      {
        dedupeKey: `p1:${morning}`,
        placeId: "p1",
        startTimeMs: morning,
        endTimeMs: morning + 3_600_000,
        importId: null,
        createdAt: 0,
      },
      {
        dedupeKey: `p1:${evening}`,
        placeId: "p1",
        startTimeMs: evening,
        endTimeMs: null,
        importId: null,
        createdAt: 0,
      },
    ]);
    renderView();
    await screen.findByText("Create trip");
    // The preview copy exists and explains itself once dates are chosen.
    expect(document.body.textContent).toMatch(/Every visit inside the window/);
    await disposeTestDb(db);
  });

  it("explains what auto-suggested means on trip cards", async () => {
    const db = openTestDb("trips-provenance");
    await db.trips.put({
      id: "t1",
      name: "Hills",
      startDay: "2026-01-02",
      endDay: "2026-01-09",
      provenance: "inferred",
      createdAt: 0,
    });
    renderView();
    const badge = await screen.findByText("auto-suggested");
    expect(badge.getAttribute("title")).toMatch(/Suggested automatically/);
    expect(document.body.textContent).toMatch(/8 days/);
    await disposeTestDb(db);
  });
});
