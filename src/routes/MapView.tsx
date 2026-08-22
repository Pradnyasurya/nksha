import { useLiveQuery } from "dexie-react-hooks";
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  Map as MaplibreMap,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { getDb } from "@/db/db";
import type { BasemapStyle, Place, Visit } from "@/db/schema";
import { getBasemapStyle, getCustomStyleUrl } from "@/db/repo";
import { Link } from "react-router-dom";
import { VisitDetailCard } from "@/features/map/VisitDetailCard";
import {
  buildCartoStyle,
  isValidStyleUrl,
  resolveMapStyle,
} from "@/features/map/mapStyles";
import {
  fetchValidatedStyle,
  setStylePreservingCamera,
} from "@/features/map/styleLoader";
import {
  placeIndex,
  visitsToGeoJson,
  yearColorMatch,
} from "@/features/map/visitsLayer";

const VISITS_SOURCE = "visits";
const CLUSTER_LAYER = "visit-clusters";
const POINT_LAYER = "visit-points";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const appliedKeyRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);

  const preference =
    useLiveQuery(() => getBasemapStyle(), [], "dark" as BasemapStyle);
  const customUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: buildCartoStyle("dark"),
    });
    map.addControl(new NavigationControl(), "top-right");

    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: [POINT_LAYER, CLUSTER_LAYER],
      });
      if (features.length === 0) {
        setSelectedVisitId(null);
        return;
      }
      const feature = features[0];
      if (feature.properties && "point_count" in feature.properties) {
        void expandCluster(map, feature.properties.cluster_id as number)
          .then((zoom) => {
            map.easeTo({
              center: (
                feature.geometry as { coordinates: [number, number] }
              ).coordinates,
              zoom,
            });
          });
        return;
      }
      const visitId = Number(feature.properties?.visitId);
      if (Number.isFinite(visitId)) {
        setSelectedVisitId(visitId);
      }
    });

    map.on("mousemove", (event) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: [POINT_LAYER, CLUSTER_LAYER],
      });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    });

    const bump = () => setStyleVersion((v) => v + 1);
    map.on("load", bump);
    map.on("style.load", bump);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      appliedKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const key = `${preference}|${customUrl.trim()}`;
    if (key === appliedKeyRef.current) return;

    let cancelled = false;
    const resolved = resolveMapStyle(preference, customUrl);

    async function apply() {
      if (resolved.kind === "carto") {
        setStylePreservingCamera(map!, buildCartoStyle(resolved.flavor));
        appliedKeyRef.current = key;
        setNotice(null);
        return;
      }
      if (!isValidStyleUrl(resolved.url)) {
        fallbackToDefault("Invalid style URL — using default basemap");
        return;
      }
      try {
        const style = await fetchValidatedStyle(resolved.url);
        if (cancelled) return;
        setStylePreservingCamera(map!, style);
        appliedKeyRef.current = key;
        setNotice(null);
      } catch {
        if (!cancelled) {
          fallbackToDefault("Custom style failed to load — using default");
        }
      }
    }

    function fallbackToDefault(message: string) {
      const current = resolveMapStyle(preference, "");
      if (current.kind !== "carto") return;
      setStylePreservingCamera(map!, buildCartoStyle(current.flavor));
      appliedKeyRef.current = key;
      setNotice(message);
    }

    void apply();
    return () => {
      cancelled = true;
    };
  }, [preference, customUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;

    ensureVisitsLayers(map);
    const source = map.getSource(VISITS_SOURCE) as GeoJSONSource;
    source.setData(visitsToGeoJson(visits, placeIndex(places)));

    const match = yearColorMatch(visits);
    const circleColor = [
      "match",
      ["get", "year"],
      ...match.flat(),
      "#888888",
    ] as unknown as ExpressionSpecification;
    map.setPaintProperty(POINT_LAYER, "circle-color", circleColor);
  }, [places, visits, styleVersion]);

  const selectedPlace =
    selectedVisitId !== null
      ? placesByIdForSelection(places, visits, selectedVisitId).place
      : undefined;
  const selectedVisit =
    selectedVisitId !== null
      ? placesByIdForSelection(places, visits, selectedVisitId).visit
      : undefined;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {selectedPlace && selectedVisit && (
        <VisitDetailCard
          place={selectedPlace}
          visit={selectedVisit}
          onClose={() => setSelectedVisitId(null)}
        />
      )}

      {visits.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-lg border border-border bg-card px-6 py-4 text-center shadow">
          <p className="text-sm font-medium">No visits yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import your Google Timeline to see your history here.{" "}
            <Link to="/import" className="text-primary underline">
              Import now
            </Link>
          </p>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

function ensureVisitsLayers(map: MaplibreMap): void {
  if (!map.getSource(VISITS_SOURCE)) {
    map.addSource(VISITS_SOURCE, {
      type: "geojson",
      data: EMPTY_FC,
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: 14,
    });
    map.addLayer({
      id: CLUSTER_LAYER,
      type: "circle",
      source: VISITS_SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#8a7a5c",
        "circle-opacity": 0.75,
        "circle-radius": [
          "step",
          ["get", "point_count"],
          14,
          25,
          20,
          100,
          27,
        ],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff55",
      },
    });
    map.addLayer({
      id: POINT_LAYER,
      type: "circle",
      source: VISITS_SOURCE,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#888888",
        "circle-radius": 6,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffffcc",
      },
    });
  }
}

async function expandCluster(
  map: MaplibreMap,
  clusterId: number,
): Promise<number> {
  const source = map.getSource(VISITS_SOURCE) as GeoJSONSource;
  return source.getClusterExpansionZoom(clusterId);
}

function placesByIdForSelection(
  places: Place[],
  visits: Visit[],
  visitId: number,
): { place?: Place; visit?: Visit } {
  const visit = visits.find((v) => v.id === visitId);
  if (!visit) return {};
  const place = places.find((p) => p.id === visit.placeId);
  return place ? { place, visit } : {};
}
