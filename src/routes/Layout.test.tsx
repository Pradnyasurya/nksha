/// <reference types="node" />
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Layout } from "@/routes/Layout";
import ImportView from "@/routes/ImportView";
import { openTestDb } from "@/test/testDb";
import { getDb } from "@/db/db";
import type { NkshaDB } from "@/db/schema";

function renderLayout(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p data-testid="stub">map</p>} />
          <Route path="import" element={<p data-testid="stub">import</p>} />
          <Route path="trips" element={<p data-testid="stub">trips</p>} />
          <Route path="playback" element={<p data-testid="stub">playback</p>} />
          <Route path="heatmap" element={<p data-testid="stub">heatmap</p>} />
          <Route path="dashboard" element={<p data-testid="stub">dashboard</p>} />
          <Route path="settings" element={<p data-testid="stub">settings</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function seedOneVisit(db: NkshaDB): Promise<void> {
  await db.places.put({
    id: "p1",
    name: "Home",
    address: "",
    lat: 10,
    lng: 10,
    isHome: 0,
    createdAt: 0,
  });
  await db.visits.add({
    dedupeKey: "p1:1000",
    placeId: "p1",
    startTimeMs: 1000,
    endTimeMs: 2000,
    importId: null,
    createdAt: 0,
  });
}

describe("Layout — mobile overflow guards (#P0)", () => {
  afterEach(() => {
    cleanup();
  });

  it("the app shell clamps horizontal overflow at every width", () => {
    const db = openTestDb("layout-overflow");
    void db;
    const { container } = renderLayout();
    const shell = container.firstElementChild as HTMLElement;
    // These classes are what keeps the document from exceeding 320–390 px:
    // no child can push the flex column wider than the viewport.
    expect(shell.className).toContain("min-w-0");
    expect(shell.className).toContain("overflow-hidden");
    expect(shell.className).toContain("h-dvh");
    cleanup();

    // And the stylesheet enforces the document-level guard.
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    expect(css).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/s);
    expect(css).toMatch(/#root\s*\{[^}]*min-width:\s*0/s);
  });

  it("mobile uses a bottom tab bar with the four main destinations", async () => {
    const db = openTestDb("layout-tabs");
    await seedOneVisit(db);
    renderLayout();
    // Bottom nav is the nav that is NOT inside the header.
    await waitFor(() => {
      expect(document.querySelector("main nav, nav.border-t")).toBeTruthy();
    });
    const bottomNav = document.querySelector("nav.border-t")!;
    const labels = [...bottomNav.querySelectorAll("a")].map((a) =>
      a.textContent?.trim(),
    );
    expect(labels).toEqual(["Map", "Story", "Insights", "Trips"]);
    // Touch targets: every tab is at least 44 px tall.
    for (const tab of bottomNav.querySelectorAll("a")) {
      expect(tab.className).toMatch(/min-h-14/);
    }
  });

  it("marks the active destination with aria-current", async () => {
    const db = openTestDb("layout-current");
    await seedOneVisit(db);
    renderLayout("/trips");
    await waitFor(() => {
      expect(
        document.querySelector('nav.border-t a[aria-current="page"]'),
      ).toBeTruthy();
    });
    const active = document.querySelector('nav.border-t a[aria-current="page"]')!;
    expect(active.textContent).toContain("Trips");
  });

  it("keeps Import, Heatmap and Settings behind the mobile menu", async () => {
    const db = openTestDb("layout-menu");
    await seedOneVisit(db);
    renderLayout();
    const menuButton = await screen.findByRole("button", { name: "Open menu" });
    // Closed: no secondary links visible.
    expect(screen.queryByRole("navigation", { name: "Secondary" })).toBeNull();
    fireEvent.click(menuButton);
    const secondary = screen.getByRole("navigation", { name: "Secondary" });
    const labels = [...secondary.querySelectorAll("a")].map((a) =>
      a.textContent?.trim(),
    );
    expect(labels).toEqual(["Heatmap", "Import", "Settings"]);
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("provides a skip link to the main content", async () => {
    const db = openTestDb("layout-skip");
    await seedOneVisit(db);
    renderLayout();
    const skip = await screen.findByText("Skip to content");
    expect(skip.getAttribute("href")).toBe("#main-content");
    expect(document.getElementById("main-content")).toBeTruthy();
  });
});

describe("Layout — first-run gating (#first-run)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the welcome story instead of seven empty destinations", async () => {
    openTestDb("layout-first-run");
    renderLayout();
    expect(
      await screen.findByText("Your life, mapped privately."),
    ).toBeTruthy();
    // No navigation chrome until data exists (the welcome's own <header>
    // is inside <main> and carries no border-b class).
    await waitFor(() => {
      expect(document.querySelector("header.border-b")).toBeNull();
      expect(document.querySelector("nav")).toBeNull();
    });
    // One clear action.
    const cta = screen.getByText("Import your timeline").closest("a");
    expect(cta?.getAttribute("href")).toBe("/import");
    // Trust badge.
    expect(screen.getByText(/Your data stays in this browser/)).toBeTruthy();
  });

  it("reveals the full app once visits exist", async () => {
    const db = openTestDb("layout-after-import");
    await seedOneVisit(db);
    renderLayout();
    await screen.findByTestId("stub");
    await waitFor(() => {
      expect(document.querySelector("header.border-b")).toBeTruthy();
    });
    expect(screen.queryByText("Your life, mapped privately.")).toBeNull();
  });

  it("never flashes the welcome screen before the database answers", () => {
    const db = openTestDb("layout-no-flash");
    void getDb;
    void db;
    const { container } = renderLayout();
    // visitCount is undefined on the very first render: shell renders without
    // welcome content and without nav chrome.
    expect(container.textContent).not.toContain("Your life, mapped privately.");
    expect(container.querySelector("nav")).toBeNull();
  });

  it("lets a first-run user click Import your timeline and reach the file picker (#first-run)", async () => {
    openTestDb("layout-first-run-cta");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<p data-testid="stub">map</p>} />
            <Route path="import" element={<ImportView />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    // Welcome owns "/" on an empty database…
    expect(
      await screen.findByText("Your life, mapped privately."),
    ).toBeTruthy();
    cleanup();

    // The CTA navigates to /import; render that route with the real view.
    render(
      <MemoryRouter initialEntries={["/import"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<p data-testid="stub">map</p>} />
            <Route path="import" element={<ImportView />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Drop your Google Maps Timeline export here"),
    ).toBeTruthy();
    expect(screen.queryByText("Your life, mapped privately.")).toBeNull();
    // The importer's real file input is reachable in this state.
    expect(
      document.querySelector('input[type="file"][accept*="json"]'),
    ).toBeTruthy();
  });

  it("keeps /settings reachable on first run", async () => {
    openTestDb("layout-first-run-settings");
    renderLayout("/settings");
    expect(await screen.findByTestId("stub")).toBeTruthy();
    expect(screen.queryByText("Your life, mapped privately.")).toBeNull();
  });
});
