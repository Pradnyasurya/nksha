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
import { visitsInMonth } from "@/features/dashboard/stats";
import { cn } from "@/lib/cn";

const VISITS_SOURCE = "visits";
const CLUSTER_LAYER = "visit-clusters";
const POINT_LAYER = "visit-points";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const appliedKeyRef = useRef<string | null>(null);
  const framedKeyRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tilesOffline, setTilesOffline] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [showListView, setShowListView] = useState(false);
  const [query, setQuery] = useState("");
  const [mutedYears, setMutedYears] = useState<Set<number>>(new Set());

  const preference =
    useLiveQuery(() => getBasemapStyle(), [], "dark" as BasemapStyle);
  const customUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);
  const trips = useLiveQuery(() => getDb().trips.toArray(), [], [] as Trip[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const monthFocus = searchParams.get("month");
  const [mountedAtMs] = useState(() => Date.now());

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

    // Basemap tiles are the one permitted network call; when they fail the
    // user must know their data is still there (#offline-state).
    map.on("error", (event) => {
      const status = (event as { error?: { status?: number } }).error?.status;
      if (status === undefined || status === 0 || status >= 400) {
        setTilesOffline(true);
      }
    });

    const bump = () => setStyleVersion((v) => v + 1);
    map.on("load", bump);
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
    source.setData(visitsToGeoJson(focusedVisits, placeIndex(places)));

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
  }, [places, focusedVisits, styleVersion]);

  // Automatic framing: once per dataset, frame the visible history (#map-hero).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    if (focusedVisits.length === 0) return;
    const key = `${visits.length}|${monthFocus ?? ""}`;
    if (framedKeyRef.current === key) return;
    framedKeyRef.current = key;

    const byId = placeIndex(places);
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const visit of focusedVisits) {
      const place = byId.get(visit.placeId);
      if (!place) continue;
      minLng = Math.min(minLng, place.lng); maxLng = Math.max(maxLng, place.lng);
      minLat = Math.min(minLat, place.lat); maxLat = Math.max(maxLat, place.lat);
    }
    if (minLng !== Infinity) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 70,
        duration: 600,
        maxZoom: 12,
      });
    }
  }, [focusedVisits, places, styleVersion, visits.length, monthFocus]);

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

      {selected.place && selected.visit && (
        <VisitDetailCard
          place={selected.place}
          visit={selected.visit}
          visits={visits}
          trips={trips}
          onClose={() => setSelectedVisitId(null)}
        />
      )}

      {/* Search + actions overlay */}
      {visits.length > 0 && (
        <div className="absolute inset-x-3 top-3 z-10 flex items-start gap-2 sm:inset-x-auto sm:left-4 sm:right-auto">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <MapPin
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search places, years…"
              aria-label="Search your history"
              className="h-11 w-full rounded-lg border border-border bg-card/95 pl-8 pr-8 text-sm shadow backdrop-blur placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                onClick={() => setQuery("")}
              >
                <X size={13} aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={surpriseMe}
            title="Jump to a random memorable visit"
            aria-label="Surprise me: jump to a random visit"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow backdrop-blur hover:text-foreground"
          >
            <Dices size={17} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowListView((v) => !v)}
            aria-expanded={showListView}
            title="Toggle place list (no-map browsing)"
            aria-label="Toggle place list"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow backdrop-blur hover:text-foreground"
          >
            <List size={17} aria-hidden />
          </button>
        </div>
      )}

      {/* Non-map alternative: browse places without touching the canvas. */}
      {showListView && visits.length > 0 && (
        <aside
          aria-label="Your places as a list"
          className="absolute bottom-24 left-3 right-3 top-32 z-10 overflow-y-auto rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:left-4 sm:right-auto sm:w-96"
        >
          <PlaceList
            visits={focusedVisits}
            places={places}
            onFocus={focusFromList}
          />
        </aside>
      )}

      {summary && !monthFocus && mutedYears.size === 0 && !query && (
        <p className="absolute left-1/2 top-16 z-[5] hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-card/90 px-3 py-1 text-xs tabular-nums text-muted-foreground shadow backdrop-blur sm:block">
          {summary}
        </p>
      )}

      {/* Year legend doubling as a scrubber/filter (#map-hero, #a11y). */}
      {years.length > 0 && (
        <div className="absolute inset-x-2 bottom-2 z-10 sm:inset-x-auto sm:left-4">
          <div
            role="group"
            aria-label="Filter by year"
            className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-card/95 p-2 shadow backdrop-blur"
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
        <div className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-lg border border-border bg-card px-6 py-4 text-center shadow">
          <p className="font-display text-base font-semibold">No visits yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import your Google Timeline to see your history here.{" "}
            <Link to="/import" className="text-primary underline">
              Import now
            </Link>
          </p>
        </div>
      )}

      {monthFocus && (
        <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-md bg-card px-3 py-1.5 text-xs shadow">
          <span>
            Showing <strong>{monthFocus}</strong> · {focusedVisits.length}{" "}
            {focusedVisits.length === 1 ? "visit" : "visits"}
          </span>
          <button
            type="button"
            className="rounded border border-border px-1.5 py-0.5 hover:bg-muted"
            onClick={() => setSearchParams({})}
          >
            Clear
          </button>
        </div>
      )}

      {tilesOffline && (
        <div
          role="status"
          className="absolute inset-x-3 bottom-20 z-10 mx-auto flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs shadow sm:bottom-16"
        >
          <WifiOff size={14} aria-hidden className="shrink-0 text-primary" />
          <span>
            Map tiles could not load — you may be offline. Your visits and
            details are unaffected.
          </span>
          <button
            type="button"
            aria-label="Dismiss offline notice"
            className="ml-1 flex size-7 items-center justify-center rounded hover:bg-muted"
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
              <span className="block truncate text-xs text-muted-foreground">
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

async function expandCluster(
  map: MaplibreMap,
  clusterId: number,
): Promise<number> {
  const source = map.getSource(VISITS_SOURCE) as GeoJSONSource;
  return source.getClusterExpansionZoom(clusterId);
}
