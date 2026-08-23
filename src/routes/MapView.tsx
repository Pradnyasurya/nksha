import { useLiveQuery } from "dexie-react-hooks";
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  Map as MaplibreMap,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Dices,
  Flame,
  List,
  MapPin,
  WifiOff,
  X,
} from "lucide-react";
import { getDb } from "@/db/db";
import type { BasemapStyle, Place, Trip, Visit } from "@/db/schema";
import { getBasemapStyle, getCustomStyleUrl } from "@/db/repo";
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
  yearColor,
  yearColorMatch,
  yearOf,
} from "@/features/map/visitsLayer";
import {
  buildDwellIndex,
  sumRange,
} from "@/features/heatmap/weights";
import { visitsInMonth } from "@/features/dashboard/stats";
import { cn } from "@/lib/cn";

const VISITS_SOURCE = "visits";
const CLUSTER_LAYER = "visit-clusters";
const POINT_LAYER = "visit-points";
const HEAT_SOURCE = "dwell-heat";
const HEAT_LAYER = "dwell-heat-layer";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const HEAT_COLORS: [number, string][] = [
  [0, "#1e3a8a"],
  [0.2, "#1d4ed8"],
  [0.4, "#0891b2"],
  [0.6, "#16a34a"],
  [0.8, "#eab308"],
  [1, "#dc2626"],
];

export type AtlasLayer = "places" | "heat";

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const appliedKeyRef = useRef<string | null>(null);
  const framedKeyRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tilesOffline, setTilesOffline] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [initialStyleLoaded, setInitialStyleLoaded] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [showListView, setShowListView] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [mutedYears, setMutedYears] = useState<Set<number>>(new Set());

  const preference =
    useLiveQuery(() => getBasemapStyle(), [], "dark" as BasemapStyle);
  const customUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);
  const trips = useLiveQuery(() => getDb().trips.toArray(), [], [] as Trip[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const monthFocus = searchParams.get("month");
  // Dwell heat is an Atlas layer (#atlas-layers), not a separate product.
  const layer: AtlasLayer = searchParams.get("layer") === "heat"
    ? "heat"
    : "places";
  const [mountedAtMs] = useState(() => Date.now());

  function setLayer(next: AtlasLayer): void {
    const params = new URLSearchParams(searchParams);
    if (next === "heat") params.set("layer", "heat");
    else params.delete("layer");
    setSearchParams(params, { replace: true });
  }

  const years = useMemo(
    () => [...new Set(visits.map(yearOf))].sort((a, b) => a - b),
    [visits],
  );

  const searchedVisits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visits;
    return visits.filter((visit) => {
      const place = placeIndex(places).get(visit.placeId);
      if (!place) return false;
      return (
        place.name.toLowerCase().includes(q) ||
        place.address.toLowerCase().includes(q) ||
        String(yearOf(visit)) === q
      );
    });
  }, [visits, places, query]);

  // Aggregated per-place search matches for the results dropdown (#map-search):
  // the same query drives both this panel and the map filter, so the count
  // always agrees with what the map actually shows.
  const searchMatches = useMemo(() => {
    if (!query.trim()) return [];
    const byId = placeIndex(places);
    const agg = new Map<string, { place: Place; count: number; last: number }>();
    for (const visit of searchedVisits) {
      const place = byId.get(visit.placeId);
      if (!place) continue;
      const entry = agg.get(place.id) ?? { place, count: 0, last: 0 };
      entry.count += 1;
      entry.last = Math.max(entry.last, visit.startTimeMs);
      agg.set(place.id, entry);
    }
    return [...agg.values()].sort((a, b) => b.last - a.last).slice(0, 8);
  }, [searchedVisits, places, query]);

  // Suggested years shown before typing (#map-search): one-tap year filters.
  const suggestedYears = years.slice(-4).reverse();

  const monthVisitIds = useMemo(() => {
    if (!monthFocus) return null;
    return new Set(
      visitsInMonth(visits, monthFocus, { clampEndMs: mountedAtMs })
        .map((v) => v.id),
    );
  }, [visits, monthFocus, mountedAtMs]);

  const focusedVisits = useMemo(
    () =>
      searchedVisits.filter((visit) => {
        if (monthVisitIds && !monthVisitIds.has(visit.id)) return false;
        return !mutedYears.has(yearOf(visit));
      }),
    [searchedVisits, monthVisitIds, mutedYears],
  );

  // ---- Dwell-heat aggregation (shared index; reslicing is cheap) ----------
  const dwellIndex = useMemo(
    () =>
      layer === "heat"
        ? buildDwellIndex(visits, places, mountedAtMs)
        : null,
    [layer, visits, places, mountedAtMs],
  );

  const weightedPlaces = useMemo(() => {
    if (!dwellIndex || dwellIndex.minYear === null || dwellIndex.maxYear === null) {
      return [];
    }
    const from = Math.max(dwellIndex.minYear, mutedYears.size ? Math.min(...years.filter((y) => !mutedYears.has(y))) : dwellIndex.minYear);
    const to = Math.min(dwellIndex.maxYear, mutedYears.size ? Math.max(...years.filter((y) => !mutedYears.has(y))) : dwellIndex.maxYear);
    if (from > to) return [];
    return sumRange(dwellIndex, from, to);
  }, [dwellIndex, mutedYears, years]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: buildCartoStyle("dark"),
    });
    // The creation-time style counts as applied — the style effect below must
    // not re-issue it while the initial style is still loading, or MapLibre
    // logs "Unable to perform style diff" and rebuilds from scratch.
    appliedKeyRef.current = "dark|";
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

    // Basemap tiles are the one permitted network call; when they fail the
    // user must know their data is still there (#offline-state).
    map.on("error", (event) => {
      const status = (event as { error?: { error?: number; status?: number } }).error?.status;
      if (status === undefined || status === 0 || status >= 400) {
        setTilesOffline(true);
      }
    });

    const bump = () => setStyleVersion((v) => v + 1);
    map.on("load", () => {
      setInitialStyleLoaded(true);
      bump();
    });
    map.on("style.load", bump);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      appliedKeyRef.current = null;
      framedKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // The map is created with this exact style, so re-issuing it would only
    // trigger "Unable to perform style diff" rebuilds (#maplibre-warning).
    // Track it as already-applied; later preference changes still flow through.
    const key = `${preference}|${customUrl.trim()}`;
    if (key === appliedKeyRef.current) return;
    // Never touch setStyle before the initial style has finished loading —
    // MapLibre cannot diff a half-loaded style and rebuilds from scratch.
    if (!initialStyleLoaded) return;
    appliedKeyRef.current = key;

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
  }, [initialStyleLoaded, preference, customUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;

    ensureVisitsLayers(map);
    ensureHeatLayer(map);

    const source = map.getSource(VISITS_SOURCE) as GeoJSONSource;
    source.setData(
      layer === "places"
        ? visitsToGeoJson(focusedVisits, placeIndex(places))
        : EMPTY_FC,
    );
    const heatSource = map.getSource(HEAT_SOURCE) as GeoJSONSource;
    const maxHours = Math.max(
      1e-6,
      ...weightedPlaces.map((w) => w.dwellMs / 3_600_000),
    );
    heatSource.setData({
      type: "FeatureCollection" as const,
      features:
        layer === "heat"
          ? weightedPlaces.map((entry) => ({
              type: "Feature" as const,
              properties: {
                weight: entry.dwellMs / 3_600_000 / maxHours,
              },
              geometry: {
                type: "Point" as const,
                coordinates: [entry.place.lng, entry.place.lat],
              },
            }))
          : [],
    });

    // Layer visibility is explicit on every data pass so a mid-session
    // switch never leaves a stale layer showing.
    for (const [layerId, visible] of [
      [CLUSTER_LAYER, layer === "places"],
      [POINT_LAYER, layer === "places"],
      [HEAT_LAYER, layer === "heat"],
    ] as const) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    }

    const match = yearColorMatch(focusedVisits);
    if (match.length > 0) {
      // An empty match list yields an invalid expression (maplibre throws).
      const circleColor = [
        "match",
        ["get", "year"],
        ...match.flat(),
        "#888888",
      ] as unknown as ExpressionSpecification;
      map.setPaintProperty(POINT_LAYER, "circle-color", circleColor);
    }
  }, [places, focusedVisits, weightedPlaces, layer, styleVersion]);

  // Automatic framing: once per dataset+layer change, frame what is visible.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const targets =
      layer === "places"
        ? focusedVisits
            .map((v) => placeIndex(places).get(v.placeId))
            .filter((p): p is Place => Boolean(p))
        : weightedPlaces.map((w) => w.place);
    if (targets.length === 0) return;
    const key = `${visits.length}|${monthFocus ?? ""}|${layer}`;
    if (framedKeyRef.current === key) return;
    framedKeyRef.current = key;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const place of targets) {
      minLng = Math.min(minLng, place.lng); maxLng = Math.max(maxLng, place.lng);
      minLat = Math.min(minLat, place.lat); maxLat = Math.max(maxLat, place.lat);
    }
    if (minLng !== Infinity) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 70,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 600,
        maxZoom: 12,
      });
    }
  }, [focusedVisits, places, weightedPlaces, layer, styleVersion, visits.length, monthFocus]);

  const selected = useMemo(() => {
    if (selectedVisitId === null) return {};
    const visit = visits.find((v) => v.id === selectedVisitId);
    if (!visit) return {};
    const place = places.find((p) => p.id === visit.placeId);
    return place ? { place, visit } : {};
  }, [selectedVisitId, places, visits]);

  function surpriseMe(): void {
    if (focusedVisits.length === 0) return;
    const byId = placeIndex(places);
    const named = focusedVisits.filter((v) => byId.get(v.placeId)?.name);
    const pool = named.length > 0 ? named : focusedVisits;
    const visit = pool[Math.floor(Math.random() * pool.length)];
    if (visit.id !== undefined) setSelectedVisitId(visit.id);
    const map = mapRef.current;
    const place = byId.get(visit.placeId);
    if (map && place) {
      map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 13) });
    }
  }

  function focusFromList(placeId: string): void {
    const latest = focusedVisits
      .filter((v) => v.placeId === placeId)
      .sort((a, b) => b.startTimeMs - a.startTimeMs)[0];
    if (!latest) return;
    if (latest.id !== undefined) setSelectedVisitId(latest.id);
    const map = mapRef.current;
    const place = places.find((p) => p.id === placeId);
    if (map && place) {
      map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 13) });
    }
  }

  function toggleYear(y: number): void {
    setMutedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  }

  const totalHeatHours =
    weightedPlaces.reduce((sum, w) => sum + w.dwellMs, 0) / 3_600_000;

  const summary =
    visits.length > 0
      ? `${years.length} ${years.length === 1 ? "year" : "years"} · ${places.length} ${
          places.length === 1 ? "place" : "places"
        } · ${trips.length} ${trips.length === 1 ? "trip" : "trips"}`
      : "";

  return (
    <div className="relative h-full min-w-0 w-full">
      {/* h-full w-full (not absolute inset-0): maplibre's own
          .maplibregl-map rule would override a layered .absolute. */}
      <div ref={containerRef} className="h-full w-full" />

      {selected.place && selected.visit && layer === "places" && (
        <VisitDetailCard
          place={selected.place}
          visit={selected.visit}
          visits={visits}
          trips={trips}
          onClose={() => setSelectedVisitId(null)}
        />
      )}

      {/* Unified top-left toolbar: search, layer, list, surprise (#atlas). */}
      {visits.length > 0 && (
        <div className="absolute inset-x-3 top-3 z-10 flex items-start gap-2 sm:inset-x-auto sm:left-4 sm:right-auto">
          <div className="relative min-w-0 flex-1 sm:w-72">
            <MapPin
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (searchMatches.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlighted((h) => (h + 1) % searchMatches.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlighted(
                    (h) => (h - 1 + searchMatches.length) % searchMatches.length,
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const match = searchMatches[highlighted];
                  if (match) {
                    focusFromList(match.place.id);
                    setSearchFocused(false);
                  }
                }
              }}
              placeholder="Search places, years…"
              aria-label="Search your history"
              role="combobox"
              aria-expanded={searchFocused && query.trim() !== ""}
              aria-controls="map-search-results"
              className="map-chrome h-11 w-full rounded-xl pl-9 pr-9 text-[15px] shadow-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                onClick={() => {
                  setQuery("");
                  setHighlighted(0);
                }}
              >
                <X size={13} aria-hidden />
              </button>
            )}

            {/* Results panel (#map-search): the query's effect is never silent,
                even with the place-list closed. */}
            {(query.trim() !== "" || suggestedYears.length > 0) &&
              visits.length > 0 && (
              <div
                id="map-search-results"
                data-testid="map-search-panel"
                aria-label="Search results"
                className="map-chrome absolute left-0 right-0 top-[3.25rem] max-h-72 overflow-y-auto rounded-xl p-2 text-sm shadow-none"
              >
                {query.trim() === "" ? (
                  <div className="p-1">
                    <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                      Suggested years
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedYears.map((y) => (
                        <button
                          key={y}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setQuery(String(y))}
                          className="min-h-9 rounded-full border border-border px-3 py-1 text-sm tabular-nums hover:bg-muted"
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : searchMatches.length === 0 ? (
                  <div role="status" data-testid="map-search-empty" className="p-3 text-sm text-muted-foreground">
                    No matches for “{query.trim()}”.
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setQuery("")}
                      className="ml-1 font-medium text-primary underline underline-offset-2"
                    >
                      Clear the search
                    </button>{" "}
                    to bring every pin back.
                  </div>
                ) : (
                  <>
                    <p role="status" className="px-2 py-1 text-xs text-muted-foreground tabular">
                      {focusedVisits.length}{" "}
                      {focusedVisits.length === 1 ? "visit" : "visits"} in{" "}
                      {searchMatches.length}{" "}
                      {searchMatches.length === 1 ? "place" : "places"} · ↑↓ to
                      move, Enter to jump
                    </p>
                    <ul role="listbox" aria-label="Matching places">
                      {searchMatches.map((match, index) => (
                        <li key={match.place.id} role="option" aria-selected={index === highlighted}>
                          <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              focusFromList(match.place.id);
                              setSearchFocused(false);
                            }}
                            onMouseEnter={() => setHighlighted(index)}
                            className={cn(
                              "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left",
                              index === highlighted ? "bg-accent" : "hover:bg-muted",
                            )}
                          >
                            <span className="min-w-0 truncate text-[15px]">
                              {match.place.name || "Unnamed place"}
                              <span className="block truncate text-xs text-muted-foreground tabular">
                                {match.count} {match.count === 1 ? "visit" : "visits"} ·{" "}
                                {new Date(match.last).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                })}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Layer segmented control: Places / Dwell heat (#atlas-layers). */}
          <div
            role="group"
            aria-label="Map layer"
            className="map-chrome flex shrink-0 items-center gap-0.5 rounded-xl p-1 shadow-none"
          >
            <button
              type="button"
              aria-pressed={layer === "places"}
              onClick={() => setLayer("places")}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                layer === "places"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MapPin size={14} aria-hidden />
              Places
            </button>
            <button
              type="button"
              aria-pressed={layer === "heat"}
              onClick={() => setLayer("heat")}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                layer === "heat"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Flame size={14} aria-hidden />
              Dwell heat
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowListView((v) => !v)}
            aria-expanded={showListView}
            title="Toggle the place list"
            aria-label="Toggle place list"
            className={cn(
              "map-chrome flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground shadow-none hover:text-foreground",
              showListView && "text-foreground",
            )}
          >
            <List size={17} aria-hidden />
          </button>
          <button
            type="button"
            onClick={surpriseMe}
            title="Jump to a random memorable visit"
            aria-label="Surprise me: jump to a random visit"
            className="map-chrome hidden size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground shadow-none hover:text-foreground sm:flex"
          >
            <Dices size={17} aria-hidden />
          </button>
        </div>
      )}

      {/* Heat legend beside the map while the dwell layer is active. */}
      {layer === "heat" && visits.length > 0 && (
        <div className="map-chrome absolute bottom-20 left-3 z-10 flex items-center gap-2 rounded-full px-3 py-1.5 shadow-none sm:bottom-6 sm:left-4">
          <span className="text-xs font-medium text-muted-foreground">Fewer hours</span>
          <span
            aria-hidden
            className="h-2.5 w-24 rounded-full sm:w-36"
            style={{
              background:
                "linear-gradient(to right, #1e3a8a, #1d4ed8, #0891b2, #16a34a, #eab308, #dc2626)",
            }}
          />
          <span className="text-xs font-medium text-muted-foreground">More hours</span>
          <span className="sr-only">
            Glow intensity shows total hours spent at each place.
          </span>
        </div>
      )}

      {layer === "heat" && visits.length > 0 && totalHeatHours > 0 && (
        <p
          role="status"
          data-testid="atlas-heat-summary"
          className="map-chrome absolute left-1/2 top-16 z-[5] hidden -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs text-muted-foreground shadow-none sm:block tabular"
        >
          {Math.round(totalHeatHours).toLocaleString()} hours across{" "}
          {weightedPlaces.length} {weightedPlaces.length === 1 ? "place" : "places"} ·{" "}
          {[...years.filter((y) => !mutedYears.has(y))].join(", ") || "no years"}
        </p>
      )}

      {/* Non-map alternative: browse places without touching the canvas. */}
      {showListView && visits.length > 0 && (
        <aside
          aria-label="Your places as a list"
          className="map-chrome absolute bottom-24 left-3 right-3 top-32 z-10 overflow-y-auto rounded-xl p-3 shadow-none sm:bottom-16 sm:left-4 sm:right-auto sm:w-96"
        >
          <PlaceList
            visits={focusedVisits}
            places={places}
            onFocus={focusFromList}
          />
        </aside>
      )}

      {summary && layer === "places" && !monthFocus && mutedYears.size === 0 && !query && (
        <p className="map-chrome absolute left-1/2 top-16 z-[5] hidden -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs text-muted-foreground shadow-none sm:block tabular">
          {summary}
        </p>
      )}

      {/* Year legend doubling as a scrubber/filter (#map-hero, #a11y). */}
      {years.length > 0 && (
        <div className="absolute inset-x-2 bottom-2 z-10 sm:inset-x-auto sm:left-4">
          <div
            role="group"
            aria-label="Filter by year"
            className="map-chrome flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl p-2 shadow-none"
          >
            {years.map((y) => {
              const active = !mutedYears.has(y);
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleYear(y)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground line-through opacity-60",
                  )}
                  style={{
                    borderColor: active ? yearColor(y) : "var(--border)",
                    backgroundColor: active
                      ? `color-mix(in oklab, ${yearColor(y)} 22%, transparent)`
                      : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: yearColor(y) }}
                  />
                  {y}
                </button>
              );
            })}
            {mutedYears.size > 0 && (
              <button
                type="button"
                onClick={() => setMutedYears(new Set())}
                className="min-h-9 shrink-0 rounded-full px-2.5 text-xs text-primary underline underline-offset-2"
              >
                Show all
              </button>
            )}
          </div>
        </div>
      )}

      {visits.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-xl border border-border bg-card px-8 py-6 text-center shadow-low">
          <p className="font-display text-lg font-semibold">Your atlas awaits</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Choose your timeline file to see your history here.{" "}
            <Link to="/import" className="text-primary underline">
              Import
            </Link>
          </p>
        </div>
      )}

      {monthFocus && (
        <div className="map-chrome absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs shadow-none tabular">
          <span>
            Showing <strong>{monthFocus}</strong> · {focusedVisits.length}{" "}
            {focusedVisits.length === 1 ? "visit" : "visits"}
          </span>
          <button
            type="button"
            className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted"
            onClick={() => setSearchParams({})}
          >
            Clear
          </button>
        </div>
      )}

      {tilesOffline && (
        <div
          role="status"
          data-testid="offline-banner"
          className="map-chrome absolute inset-x-3 bottom-20 z-10 mx-auto flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-xs shadow-none sm:bottom-16"
        >
          <WifiOff size={14} aria-hidden className="shrink-0 text-primary" />
          <span>Map tiles are unavailable. Your saved places are still here.</span>
          <button
            type="button"
            onClick={() => setShowListView(true)}
            className="font-medium text-primary underline underline-offset-2"
          >
            Open list
          </button>
          <button
            type="button"
            aria-label="Dismiss offline notice"
            className="flex size-7 items-center justify-center rounded hover:bg-muted"
            onClick={() => setTilesOffline(false)}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow sm:bottom-16"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

/** Text-first browsing: every place reachable without the map canvas. */
function PlaceList({
  visits,
  places,
  onFocus,
}: {
  visits: Visit[];
  places: Place[];
  onFocus: (placeId: string) => void;
}) {
  const byId = useMemo(() => placeIndex(places), [places]);
  const agg = useMemo(() => {
    const map = new Map<string, { place: Place; count: number; last: number }>();
    for (const visit of visits) {
      const place = byId.get(visit.placeId);
      if (!place) continue;
      const entry = map.get(place.id) ?? { place, count: 0, last: 0 };
      entry.count += 1;
      entry.last = Math.max(entry.last, visit.startTimeMs);
      map.set(place.id, entry);
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  }, [visits, byId]);

  if (agg.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">No matches.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {agg.map(({ place, count, last }) => (
        <li key={place.id}>
          <button
            type="button"
            onClick={() => onFocus(place.id)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-1 py-2 text-left hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {place.name || "Unnamed place"}
              </span>
              <span className="block truncate text-xs text-muted-foreground tabular">
                {count} {count === 1 ? "visit" : "visits"} ·{" "}
                {new Date(last).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })}
              </span>
            </span>
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: yearColor(new Date(last).getFullYear()) }}
            />
          </button>
        </li>
      ))}
    </ul>
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

function ensureHeatLayer(map: MaplibreMap): void {
  if (!map.getSource(HEAT_SOURCE)) {
    map.addSource(HEAT_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: HEAT_LAYER,
      type: "heatmap",
      source: HEAT_SOURCE,
      layout: { visibility: "none" },
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
  }
}

async function expandCluster(
  map: MaplibreMap,
  clusterId: number,
): Promise<number> {
  const source = map.getSource(VISITS_SOURCE) as GeoJSONSource;
  return source.getClusterExpansionZoom(clusterId);
}
