import { describe, expect, it } from "vitest";
import {
  buildCartoStyle,
  isValidStyleUrl,
  resolveMapStyle,
} from "@/features/map/mapStyles";

describe("resolveMapStyle", () => {
  it("defaults to carto dark when nothing is configured", () => {
    expect(resolveMapStyle("dark", "")).toEqual({
      kind: "carto",
      flavor: "dark",
    });
  });

  it("follows the dark/light toggle", () => {
    expect(resolveMapStyle("light", "")).toEqual({
      kind: "carto",
      flavor: "light",
    });
    expect(resolveMapStyle("dark", "")).toEqual({
      kind: "carto",
      flavor: "dark",
    });
  });

  it("custom URL takes precedence over the toggle", () => {
    expect(resolveMapStyle("light", "my-style.json")).toEqual({
      kind: "custom",
      url: "my-style.json",
    });
  });

  it("blank or whitespace-only override falls back to the toggle", () => {
    expect(resolveMapStyle("light", "   ")).toEqual({
      kind: "carto",
      flavor: "light",
    });
  });
});

describe("isValidStyleUrl", () => {
  it("accepts absolute http(s) URLs only", () => {
    expect(isValidStyleUrl("https://example.org/style.json")).toBe(true);
    expect(isValidStyleUrl("http://localhost:8080/style.json")).toBe(true);
    expect(isValidStyleUrl("not a url")).toBe(false);
    expect(isValidStyleUrl("/relative/style.json")).toBe(false);
    expect(isValidStyleUrl("javascript:alert(1)")).toBe(false);
    expect(isValidStyleUrl("data:text/json,{}")).toBe(false);
  });
});

describe("buildCartoStyle", () => {
  it("builds a valid MapLibre raster style for dark", () => {
    const style = buildCartoStyle("dark");
    expect(style.version).toBe(8);
    const source = style.sources.carto as {
      tiles: string[];
      tileSize: number;
    };
    expect(source.tiles.length).toBeGreaterThanOrEqual(4);
    expect(source.tileSize).toBeGreaterThan(0);
    expect(source.tiles.every((t) => t.includes("dark"))).toBe(true);
    expect(style.layers.some((l) => l.type === "raster")).toBe(true);
  });

  it("switching flavor swaps the tile path", () => {
    expect(buildCartoStyle("light")).not.toEqual(buildCartoStyle("dark"));
  });
});
