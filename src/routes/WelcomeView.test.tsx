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
    expect(screen.getByText("Your life, mapped privately.")).toBeTruthy();
    const cta = screen.getByText("Import your timeline").closest("a");
    expect(cta?.getAttribute("href")).toBe("/import");
  });

  it("makes the privacy promise and trust badge visible", () => {
    renderView();
    expect(
      screen.getByText(/it never leaves this device/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Your data stays in this browser/),
    ).toBeTruthy();
  });

  it("names the three benefits of importing", () => {
    renderView();
    for (const title of [
      "Explore your places",
      "Replay your years",
      "Find your patterns",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("explains which Google export file to choose", () => {
    renderView();
    expect(document.body.textContent).toMatch(/takeout\.google\.com/);
    expect(document.body.textContent).toMatch(/Location History \(Timeline\)\.json/);
  });

  it("labels its preview as synthetic sample data", () => {
    renderView();
    expect(screen.getByText(/Sample preview/)).toBeTruthy();
    // The preview is decorative SVG, hidden from assistive tech.
    expect(
      document.querySelector('[data-testid="welcome-preview"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});
