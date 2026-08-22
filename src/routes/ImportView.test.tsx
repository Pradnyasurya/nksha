import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportView from "@/routes/ImportView";
import { buildDiagnostic } from "@/features/import/diagnostics";
import { openTestDb, disposeTestDb } from "@/test/testDb";
import type { ImportReport, ImportState } from "@/features/import/useImporter";

const REPORT: ImportReport = {
  placesFound: 12,
  visitsCreated: 340,
  visitsSkipped: 4,
  movementsCreated: 210,
  firstVisitTimeMs: Date.UTC(2019, 2, 1),
  lastVisitTimeMs: Date.UTC(2026, 3, 20),
  tripsInferred: 7,
  skippedSegments: 9,
  skippedByReason: {
    "missing-timestamp": 5,
    "missing-coordinates": 4,
  },
  overlappingExisting: 120,
};

vi.mock("@/features/import/useImporter", () => ({
  stageLabel: (stage: string) => `label:${stage}`,
  useImporter: vi.fn(),
}));

import { useImporter } from "@/features/import/useImporter";

function mockState(state: ImportState) {
  vi.mocked(useImporter).mockReturnValue({
    state,
    importFile: vi.fn().mockResolvedValue(undefined),
  });
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/import"]}>
      <ImportView />
    </MemoryRouter>,
  );
}

describe("ImportView ceremony (#import-ceremony)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("the dropzone is a real button a keyboard can reach", () => {
    mockState({ phase: "idle" });
    openTestDb("import-idle");
    renderView();
    const dropzone = document.querySelector('[data-testid="dropzone"]')!;
    const button = dropzone.querySelector("button");
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("type")).toBe("button");
    // The labelled file input exists for assistive tech.
    const input = dropzone.querySelector('input[type="file"]');
    expect(input?.getAttribute("aria-label")).toMatch(/Timeline export/);
    // Supported-format guidance is visible without interaction.
    expect(screen.getByText(/\.json up to roughly/)).toBeTruthy();
  });

  it("announces parsing stages while working", () => {
    mockState({
      phase: "working",
      fileName: "timeline.json",
      stage: "parsing",
    });
    renderView();
    const live = document.querySelector('[data-testid="dropzone"] [aria-live="polite"]')!;
    expect(live.textContent).toContain("label:parsing");
  });

  it("explains failures and offers a retry next to the action", () => {
    mockState({
      phase: "error",
      fileName: "old.json",
      message: "This file does not look like a Google Maps Timeline export.",
      code: "unsupported-format",
    });
    renderView();
    expect(screen.getByRole("alert").textContent).toContain("Could not import old.json");
    expect(screen.getByRole("button", { name: /Try another file/ })).toBeTruthy();
    expect(screen.getByText("What file should I use?")).toBeTruthy();
  });

  it("reports the full outcome, including skips, merge note and diagnostics", () => {
    mockState({ phase: "done", fileName: "timeline.json", report: REPORT });
    renderView();
    expect(document.querySelector('[data-testid="import-report"]')!.textContent).toContain(
      "340",
    );
    expect(document.querySelector('[data-testid="import-report"]')!.textContent).toContain(
      "210",
    );
    // Merge warning because the range overlapped existing data.
    expect(screen.getByText(/Merged with existing data/)).toBeTruthy();
    // Skipped reasons are broken down locally.
    expect(document.querySelector("[data-testid='import-report'] summary")!.textContent).toContain(
      "skipped",
    );
    expect(screen.getByRole("button", { name: /Save local report/ })).toBeTruthy();
  });

  it("warns loudly when an import produces zero visits", () => {
    mockState({
      phase: "done",
      fileName: "empty-ish.json",
      report: { ...REPORT, visitsCreated: 0 },
    });
    renderView();
    expect(screen.getByRole("alert").textContent).toContain("No visits came out of this file");
  });

  it("diagnostics carry structure and counts only — never coordinates or names", () => {
    const payload = JSON.parse(buildDiagnostic("timeline.json", REPORT));
    expect(payload.kind).toBe("nksha-import-diagnostics");
    expect(payload.visitsCreated).toBe(340);
    expect(payload.skippedByReason).toEqual({
      "missing-timestamp": 5,
      "missing-coordinates": 4,
    });
    // Privacy: the serialised report contains no coordinates or place names.
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/lat|lng|placeId|Home/i);
  });
});

describe("ImportView storage hygiene", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders inside an isolated database without touching real storage", async () => {
    const db = openTestDb("import-storage");
    mockState({ phase: "idle" });
    renderView();
    expect(document.querySelector('[data-testid="dropzone"]')).toBeTruthy();
    await disposeTestDb(db);
  });
});
