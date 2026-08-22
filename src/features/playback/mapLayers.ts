import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
} from "maplibre-gl";
import type { Place, Visit } from "@/db/schema";
import type { PlaybackPoint, PlaybackTimeline } from "./engine";

/**
 * Shared MapLibre plumbing for playback rendering (#8) reused verbatim by
 * the MP4 exporter (#9) so exported frames match what is on screen.
 */

export const ROUTE_SOURCE = "playback-route";
export const PINS_SOURCE = "playback-pins";
export const DOT_SOURCE = "playback-dot";
export const ROUTE_LAYER = "playback-route-line";
export const PINS_LAYER = "playback-pins-layer";
export const DOT_LAYER = "playback-dot-layer";

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry:
      | { type: "LineString"; coordinates: Array<[number, number]> }
      | { type: "Point"; coordinates: [number, number] };
  }>;
};

export const EMPTY_FC: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function ensurePlaybackLayers(map: MaplibreMap): void {
  if (map.getSource(ROUTE_SOURCE)) return;
  map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: ROUTE_LAYER,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#e0b64c",
      "line-width": 2.5,
      "line-opacity": 0.55,
    },
  });
  map.addSource(PINS_SOURCE, { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: PINS_LAYER,
    type: "circle",
    source: PINS_SOURCE,
    paint: {
      "circle-color": "#7aa5d8",
      "circle-radius": 5,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": "#ffffffcc",
    },
  });
  map.addSource(DOT_SOURCE, { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: DOT_LAYER,
    type: "circle",
    source: DOT_SOURCE,
    paint: {
      "circle-color": "#ff5c38",
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
}

export function setRouteData(map: MaplibreMap, timeline: PlaybackTimeline): void {
  sourceOf(map, ROUTE_SOURCE).setData(routeCollection(timeline));
}

export function setPinData(
  map: MaplibreMap,
  timeline: PlaybackTimeline,
  visits: Visit[],
  places: Place[],
): void {
  const placesById = new Map(places.map((p) => [p.id, p]));
  sourceOf(map, PINS_SOURCE).setData(pinCollection(timeline, visits, placesById));
}

export function routeCollection(timeline: PlaybackTimeline): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: timeline.segments
      .filter((segment) => segment.kind === "travel")
      .map((segment) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: segment.points.map(
            (p) => [p.lng, p.lat] as [number, number],
          ),
        },
      })),
  };
}

export function pinCollection(
  timeline: PlaybackTimeline,
  visits: Visit[],
  placesById: Map<string, Place>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: timeline.arrivals.map(({ visitId, atMs }) => {
      const visit = visits.find((v) => v.id === visitId)!;
      const place = placesById.get(visit.placeId)!;
      return {
        type: "Feature" as const,
        properties: { visitId, arrivalMs: atMs, name: place.name || place.id },
        geometry: {
          type: "Point" as const,
          coordinates: [place.lng, place.lat],
        },
      };
    }),
  };
}

/** Pins whose arrival t has crossed are visible. */
export function pinVisibilityFilter(tMs: number): ExpressionSpecification {
  return ["<=", ["get", "arrivalMs"], tMs] as unknown as ExpressionSpecification;
}

export function applyPinVisibility(map: MaplibreMap, tMs: number): void {
  if (map.getLayer(PINS_LAYER)) map.setFilter(PINS_LAYER, pinVisibilityFilter(tMs));
}

export function applyDot(map: MaplibreMap, dot: PlaybackPoint | null): void {
  sourceOf(map, DOT_SOURCE).setData(
    dot
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [dot.lng, dot.lat],
              },
            },
          ],
        }
      : EMPTY_FC,
  );
}

/** Resolves after the next completed paint, so captures see fresh frames. */
export function waitForRender(map: MaplibreMap): Promise<void> {
  return new Promise<void>((resolve) => {
    map.once("render", () => resolve());
    map.triggerRepaint();
  });
}

function sourceOf(map: MaplibreMap, id: string): GeoJSONSource {
  return map.getSource(id) as GeoJSONSource;
}
