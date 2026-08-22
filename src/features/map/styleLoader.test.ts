import { describe, expect, it, vi } from "vitest";
import {
  InvalidStyleError,
  assertLooksLikeStyle,
  fetchValidatedStyle,
  setStylePreservingCamera,
} from "@/features/map/styleLoader";
import { buildCartoStyle } from "@/features/map/mapStyles";

describe("assertLooksLikeStyle", () => {
  it("accepts a minimal MapLibre style", () => {
    expect(() =>
      assertLooksLikeStyle({ version: 8, sources: {}, layers: [] }),
    ).not.toThrow();
  });

  it.each([
    ["array root", []],
    ["null root", null],
    ["missing version", { sources: {}, layers: [] }],
    ["missing sources", { version: 8, layers: [] }],
    ["missing layers", { version: 8, sources: {} }],
  ])("rejects %s", (_label, value) => {
    expect(() => assertLooksLikeStyle(value)).toThrow(InvalidStyleError);
  });
});

describe("fetchValidatedStyle", () => {
  it("returns the parsed style on HTTP success", async () => {
    const style = { version: 8, sources: { s: {} }, layers: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => style })),
    );
    await expect(fetchValidatedStyle("https://example.org/s.json")).resolves.toBe(
      style,
    );
    vi.unstubAllGlobals();
  });

  it("rejects non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    await expect(fetchValidatedStyle("https://example.org/s.json")).rejects.toThrow(
      InvalidStyleError,
    );
    vi.unstubAllGlobals();
  });

  it("rejects JSON that is not a style", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ hello: "world" }),
      })),
    );
    await expect(fetchValidatedStyle("https://example.org/s.json")).rejects.toThrow(
      InvalidStyleError,
    );
    vi.unstubAllGlobals();
  });
});

describe("setStylePreservingCamera", () => {
  it("restores center and zoom after the new style loads", () => {
    const camera = {
      getCenter: () => ({ lng: 77.2, lat: 32.2 }),
      getZoom: () => 11.5,
      getBearing: () => 0,
      getPitch: () => 0,
      once: vi.fn(),
      jumpTo: vi.fn(),
      setStyle: vi.fn(),
    };
    camera.once.mockImplementation(
      (event: string, handler: () => void) => {
        if (event === "style.load") handler();
      },
    );

    setStylePreservingCamera(camera as never, buildCartoStyle("light"));

    expect(camera.setStyle).toHaveBeenCalledOnce();
    expect(camera.jumpTo).toHaveBeenCalledWith({
      center: { lng: 77.2, lat: 32.2 },
      zoom: 11.5,
      bearing: 0,
      pitch: 0,
    });
  });
});
