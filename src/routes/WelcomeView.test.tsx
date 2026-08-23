import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { WelcomeView } from "@/routes/WelcomeView";

function renderView() {
  return render(
    <MemoryRouter>
      <WelcomeView />
    </MemoryRouter>,
  );
}

describe("WelcomeView (#first-run)", () => {
  afterEach(() => cleanup());

  it("leads with the product statement and a single primary action", () => {
    renderView();
    expect(screen.getByText("Your travels, kept close.")).toBeTruthy();
    const cta = screen.getByText("Choose timeline file").closest("a");
    expect(cta?.getAttribute("href")).toBe("/import");
  });

  it("makes the privacy promise and trust facts visible", () => {
    renderView();
    expect(
      screen.getByText(/private atlas that stays in this browser/),
    ).toBeTruthy();
    expect(screen.getByText(/Parsed in this browser/)).toBeTruthy();
    expect(screen.getByText(/Stored on this device/)).toBeTruthy();
    expect(screen.getByText(/No account or telemetry/)).toBeTruthy();
  });

  it("shows a clearly-labelled example atlas as product proof", () => {
    renderView();
    expect(screen.getByText(/Example atlas/)).toBeTruthy();
    // The preview is decorative SVG, hidden from assistive tech.
    expect(
      document
        .querySelector('[data-testid="welcome-preview"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("offers a secondary path that explains how to export", () => {
    renderView();
    const how = screen.getByText(/See how to export it/).closest("a");
    expect(how?.getAttribute("href")).toBe("/import#how-to-export");
  });
});
