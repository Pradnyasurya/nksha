import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";

export class InvalidStyleError extends Error {}export function assertLooksLikeStyle(json: unknown): asserts json is {
  version: number;
  sources: Record<string, unknown>;
  layers: unknown[];
} {
  if (typeof json !== "object" || json === null) {
    throw new InvalidStyleError("Style root must be an object");
  }
  const candidate = json as Record<string, unknown>;
  if (typeof candidate.version !== "number") {
    throw new InvalidStyleError("Missing numeric 'version'");
  }
  if (typeof candidate.sources !== "object" || candidate.sources === null) {
    throw new InvalidStyleError("Missing 'sources' object");
  }
  if (!Array.isArray(candidate.layers)) {
    throw new InvalidStyleError("Missing 'layers' array");
  }
}

/** Fetch and shape-check a user-supplied MapLibre style, failing soft. */
export async function fetchValidatedStyle(
  url: string,
  timeoutMs = 10_000,
): Promise<StyleSpecification> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new InvalidStyleError(`HTTP ${response.status}`);
    }
    const json: unknown = await response.json();
    assertLooksLikeStyle(json);
    return json as StyleSpecification;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Swap styles without losing the viewport. MapLibre resets the camera on
 * setStyle, so snapshot it and restore once the new style is ready.
 */
export function setStylePreservingCamera(
  map: MaplibreMap,
  nextStyle: StyleSpecification | string,
): void {
  const camera = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
  map.once("style.load", () => {
    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
    });
  });
  map.setStyle(nextStyle);
}
