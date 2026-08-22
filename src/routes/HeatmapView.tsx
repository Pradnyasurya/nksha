import { useLiveQuery } from "dexie-react-hooks";
import type { GeoJSONSource } from "maplibre-gl";
import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getDb } from "@/db/db";
import type { Place, Visit } from "@/db/schema";
import { getBasemapStyle } from "@/db/repo";
import {
  buildDwellIndex,
  sumRange,
  type WeightedPlace,
} from "@/features/heatmap/weights";
import { buildCartoStyle } from "@/features/map/mapStyles";

const HEAT_SOURCE = "dwell-heat";
const HEAT_LAYER = "dwell-heat-layer";
const HOTSPOT_SOURCE = "dwell-hotspots";
const HOTSPOT_LAYER = "dwell-hotspot-labels";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const HEAT_COLORS: [number, string][] = [
  [0, "#1e3a8a"],
  [0.2, "#1d4ed8"],
  [0.4, "#0891b2"],
  [0.6, "#16a34a"],
  [0.8, "#eab308"],
  [1, "#dc2626"],
];

export default function HeatmapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const preference = useLiveQuery(() => getBasemapStyle(), [], "dark");
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);
  const [mountedAtMs] = useState(() => Date.now());

  // One aggregation pass per data change; slider moves only re-slice.
  const index = useMemo(
    () => buildDwellIndex(visits, places, mountedAtMs),
    [visits, places, mountedAtMs],
  );

  const [fromYear, setFromYear] = useState<number | null>(null);
  const [toYear, setToYear] = useState<number | null>(null);

  const selected = useMemo(() => {
    if (index.minYear === null || index.maxYear === null) return null;
    return {
      fromYear: Math.max(fromYear ?? index.minYear, index.minYear),
      toYear: Math.min(toYear ?? index.maxYear, index.maxYear),
    };
  }, [index, fromYear, toYear]);

  const weighted: WeightedPlace[] = useMemo(() => {
    if (!selected) return [];
    if (selected.fromYear > selected.toYear) return [];
    return sumRange(index, selected.fromYear, selected.toYear);
  }, [index, selected]);

  const maxWeightHours = useMemo(
    () =>
      weighted.length > 0
        ? Math.max(...weighted.map((w) => w.dwellMs)) / 3_600_000
        : 0,
    [weighted],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: buildCartoStyle(preference === "light" ? "light" : "dark"),
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl(), "top-right");
    map.once("load", () => setMapReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // Basemap flavor is fixed at mount; style switching lives on the travel map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!map.getSource(HEAT_SOURCE)) {
      map.addSource(HEAT_SOURCE, { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: HEAT_LAYER,
        type: "heatmap",
        source: HEAT_SOURCE,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
          "heatmap-intensity": 0.9,
          "heatmap-radius": 42,
          "heatmap-opacity": 0.85,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            ...HEAT_COLORS.flat(),
          ],
        },
      });
      map.addSource(HOTSPOT_SOURCE, { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: HOTSPOT_LAYER,
        type: "symbol",
        source: HOTSPOT_SOURCE,
        minzoom: 6,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#00000099",
          "text-halo-width": 1.2,
        },
      });
    }
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const maxHours = Math.max(maxWeightHours, 1e-6);
    (map.getSource(HEAT_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection" as const,
      features: weighted.map((entry) => ({
        type: "Feature" as const,
        properties: {
          weight: entry.dwellMs / 3_600_000 / maxHours,
          hours: Math.round(entry.dwellMs / 3_600_000),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [entry.place.lng, entry.place.lat],
        },
      })),
    });

    const top = weighted.slice(0, 12);
    (map.getSource(HOTSPOT_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection" as const,
      features: top.map((entry) => ({
        type: "Feature" as const,
        properties: { name: entry.place.name || entry.place.id },
        geometry: {
          type: "Point" as const,
          coordinates: [entry.place.lng, entry.place.lat],
        },
      })),
    });

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const entry of weighted) {
      minLng = Math.min(minLng, entry.place.lng); maxLng = Math.max(maxLng, entry.place.lng);
      minLat = Math.min(minLat, entry.place.lat); maxLat = Math.max(maxLat, entry.place.lat);
    }
    if (minLng !== Infinity) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 80,
        duration: 200,
        maxZoom: 11,
      });
    }
  }, [weighted, maxWeightHours, mapReady]);

  const totalWeightedHours =
    weighted.reduce((sum, w) => sum + w.dwellMs, 0) / 3_600_000;

  // The map host must stay mounted on every render: the init effect has empty
  // deps, so a conditional early-return while visits are still loading would
  // leave the ref null forever and the map would never be created.
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {visits.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 p-6 text-center">
          <div>
            <p className="text-sm font-medium">No heat yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              The heatmap glows where you have lived your hours. Import your
              Google Timeline to light it up.
            </p>
            <Link
              to="/import"
              className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              Import now
            </Link>
          </div>
        </div>
      )}

      {visits.length > 0 && (
      <div className="absolute left-1/2 top-4 z-10 w-[min(92%,30rem)] -translate-x-1/2 rounded-lg border border-border bg-card/95 p-3 shadow backdrop-blur">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-base font-semibold">Dwell heatmap</h1>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {selected && `${selected.fromYear}–${selected.toYear} · `}
            {Math.round(totalWeightedHours).toLocaleString()} h across{" "}
            {weighted.length} places
          </span>
        </div>
        {index.minYear !== null && index.maxYear !== null && (
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 text-muted-foreground">From</span>
              <input
                aria-label="From year"
                type="range"
                min={index.minYear}
                max={index.maxYear}
                value={selected?.fromYear ?? index.minYear}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setFromYear(next);
                  if (selected && next > selected.toYear) setToYear(next);
                }}
                className="w-full accent-primary"
              />
              <span className="w-12 shrink-0 text-right tabular-nums">
                {selected?.fromYear}
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 text-muted-foreground">To</span>
              <input
                aria-label="To year"
                type="range"
                min={index.minYear}
                max={index.maxYear}
                value={selected?.toYear ?? index.maxYear}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setToYear(next);
                  if (selected && next < selected.fromYear) setFromYear(next);
                }}
                className="w-full accent-primary"
              />
              <span className="w-12 shrink-0 text-right tabular-nums">
                {selected?.toYear}
              </span>
            </label>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Glow intensity weights each place by total hours lived there — not
          by GPS ping counts. Slider changes reslice precomputed yearly dwell,
          so they stay smooth on large histories.
        </p>
      </div>
      )}

      {visits.length > 0 && (
      <div
        className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow backdrop-blur"
      >
        <span className="text-[10px] font-medium text-muted-foreground">Fewer hours</span>
        <span
          aria-hidden
          className="h-2.5 w-28 rounded-full sm:w-44"
          style={{
            background:
              "linear-gradient(to right, #1e3a8a, #1d4ed8, #0891b2, #16a34a, #eab308, #dc2626)",
          }}
        />
        <span className="text-[10px] font-medium text-muted-foreground">More hours</span>
      </div>
      )}
    </div>
  );
}
