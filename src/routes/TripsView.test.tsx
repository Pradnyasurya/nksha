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

describe("TripsView — Stories (#stories)", () => {
  afterEach(() => cleanup());

  it("says Create trip and never mentions a nonexistent brush", async () => {
    const db = openTestDb("trips-empty");
    renderView();
    expect(await screen.findByText("Create trip")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/brush/i);
    await disposeTestDb(db);
  });

  it("opens a focused create form on demand with stacking date fields", async () => {
    const db = openTestDb("trips-stack");
    renderView();
    expect(await screen.findByText("Create trip")).toBeTruthy();
    // The form is closed until the user asks for it (#stories).
    expect(document.querySelector("form")).toBeNull();
    screen.getByRole("button", { name: "Create trip" }).click();
    const form = await waitFor(() => {
      const el = document.querySelector("form");
      if (!el) throw new Error("form not open yet");
      return el;
    });
    // The date/action group is flex-col first, row only at sm+ — no fixed
    // widths so nothing overflows at 390 px.
    expect(form.querySelector(".flex-col.sm\\:flex-row")).toBeTruthy();
    for (const input of form.querySelectorAll<HTMLInputElement>(
      'input[type="date"]',
    )) {
      expect(input.className).toMatch(/h-11/);
      expect(input.className).not.toMatch(/w-\d/); // no fixed widths
    }
    await disposeTestDb(db);
  });

  it("hides suggestions until prerequisites exist, then embeds the Home picker", async () => {
    const empty = openTestDb("trips-novisits");
    renderView();
    await screen.findByText("Create trip");
    // Without visits the setup card points at Import; there is no silent
    // suggestion button that could never do anything.
    expect(document.body.textContent).toMatch(/choose a timeline file/i);
    expect(
      screen.queryByRole("button", { name: /Find trips again/ }),
    ).toBeNull();
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
    // Visits exist but Home is not chosen: the searchable picker is embedded.
    expect(await screen.findByTestId("choose-home")).toBeTruthy();
    expect(document.body.textContent).toMatch(/declared Home|Choose Home/i);
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
    screen.getByRole("button", { name: "Create trip" }).click();
    await waitFor(() => document.querySelector("form"));
    // The preview copy exists and explains itself.
    expect(document.body.textContent).toMatch(/Overlapping windows are rejected/);
    await disposeTestDb(db);
  });

  it("groups suggested trips apart from created ones with distinct actions", async () => {
    const db = openTestDb("trips-provenance");
    await db.trips.bulkPut([
      {
        id: "t1",
        name: "Hills",
        startDay: "2026-01-02",
        endDay: "2026-01-09",
        provenance: "inferred",
        createdAt: 0,
      },
      {
        id: "t2",
        name: "Coast",
        startDay: "2026-02-02",
        endDay: "2026-02-05",
        provenance: "declared",
        createdAt: 0,
      },
    ]);
    renderView();
    expect(await screen.findByText("Suggested")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();
    // A suggested Trip dismisses (the suggestion), not deletes.
    const dismiss = screen.getByRole("button", { name: "Dismiss Hills" });
    expect(dismiss.getAttribute("title")).toMatch(/suggested automatically/i);
    // A created Trip deletes (the trip itself).
    expect(screen.getByRole("button", { name: "Delete Coast" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/8 days/);
    await disposeTestDb(db);
  });
});
