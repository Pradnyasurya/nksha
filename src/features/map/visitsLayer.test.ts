import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  formatVisitWindow,
  visitsToGeoJson,
  yearColor,
} from "@/features/map/visitsLayer";
import type { Place, Visit } from "@/db/schema";

const place: Place = {
  id: "ChIJcafe",
  name: "Café <Alt>",
  address: "Marktstraße 1",
  lat: 32.2396,
  lng: 77.1887,
  isHome: 0,
  createdAt: 0,
};

function visit(
  id: number,
  startTimeMs: number,
  endTimeMs: number | null = null,
): Visit {
  return {
    id,
    dedupeKey: `${place.id}:${startTimeMs}`,
    placeId: place.id,
    startTimeMs,
    endTimeMs,
    importId: "imp",
    createdAt: 0,
  };
}

const places = new Map([[place.id, place]]);

describe("visitsToGeoJson", () => {
  it("projects visits onto their place coordinates with properties", () => {
    const fc = visitsToGeoJson(
      [visit(1, Date.parse("2025-03-12T10:00:00Z"), Date.parse("2025-03-12T13:00:00Z"))],
      places,
    );
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0];
    expect(f.geometry.coordinates).toEqual([77.1887, 32.2396]);
    expect(f.properties).toMatchObject({
      visitId: 1,
      placeId: "ChIJcafe",
      name: "Café <Alt>",
      address: "Marktstraße 1",
      year: 2025,
    });
  });

  it("skips visits whose place is unknown", () => {
    const fc = visitsToGeoJson([visit(1, Date.parse("2025-03-12T10:00:00Z"))], new Map());
    expect(fc.features).toHaveLength(0);
  });
});

describe("yearColor", () => {
  it("is deterministic and stable across calls", () => {
    expect(yearColor(2024)).toBe(yearColor(2024));
  });

  it("gives different years different colors", () => {
    const set = new Set([yearColor(2022), yearColor(2023), yearColor(2024)]);
    expect(set.size).toBe(3);
  });

  it("produces valid hsl() strings", () => {
    expect(yearColor(2030)).toMatch(/^hsl\(\d+(\.\d+)?, \d+%/, );
  });
});

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml(`<b class="x">&'`)).toBe(
      "&lt;b class=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
});

describe("formatVisitWindow", () => {
  it("formats arrival and departure", () => {
    const text = formatVisitWindow(
      Date.parse("2026-03-12T10:00:00Z"),
      Date.parse("2026-03-14T12:30:00Z"),
    );
    expect(text).toMatch(/Mar/);
    expect(text).toContain("–");
  });

  it("marks open-ended stays honestly", () => {
    const text = formatVisitWindow(Date.parse("2026-03-12T10:00:00Z"), null);
    expect(text.toLowerCase()).toContain("still here");
  });
});
