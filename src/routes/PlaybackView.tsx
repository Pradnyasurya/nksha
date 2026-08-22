import { useLiveQuery } from "dexie-react-hooks";
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  Map as MaplibreMap,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getDb } from "@/db/db";
import type { Place, Visit } from "@/db/schema";
import { getBasemapStyle } from "@/db/repo";
import {
  buildPlaybackTimeline,
  defaultPlaybackRange,
  renderAt,
  routeGeometry,
} from "@/features/playback/engine";
import { buildCartoStyle } from "@/features/map/mapStyles";
import { dayKeyToDate } from "@/lib/days";

const ROUTE_SOURCE = "playback-route";
const PINS_SOURCE = "playback-pins";
const DOT_SOURCE = "playback-dot";
const ROUTE_LAYER = "playback-route-line";
const PINS_LAYER = "playback-pins-layer";
const DOT_LAYER = "playback-dot-layer";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const SPEEDS = [
  { multiplier: 60, label: "1 min/s" },
  { multiplier: 600, label: "10 min/s" },
  { multiplier: 3600, label: "1 h/s" },
  { multiplier: 21_600, label: "6 h/s" },
  { multiplier: 86_400, label: "1 day/s" },
];

const READOUT_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function PlaybackView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const preference = useLiveQuery(() => getBasemapStyle(), [], "dark");
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);

  const dataBounds = useMemo(() => defaultPlaybackRange(visits), [visits]);
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);

  const range = useMemo(() => {
    if (!dataBounds) return null;
    const startMs =
      customFrom !== null ? dayKeyToDate(customFrom).getTime() : dataBounds.startMs;
    const endMs =
      customTo !== null ? endOfDayMs(customTo) : dataBounds.endMs;
    if (startMs >= endMs) return null;
    return { startMs, endMs };
  }, [dataBounds, customFrom, customTo]);

  const timeline = useMemo(
    () =>
      range && places.length > 0
        ? buildPlaybackTimeline(visits, places, range)
        : null,
    [visits, places, range],
  );

  const totalInRange = timeline ? timeline.arrivals.length : 0;

  const [clock, setClock] = useState<{
    session: string;
    t: number | null;
    playing: boolean;
  }>({ session: "", t: null, playing: false });
  const session =
    range && timeline
      ? `${range.startMs}|${range.endMs}|${timeline.segments.length}`
      : null;
  // Reset the playback clock when range or data changes — done during render
  // (the React-documented pattern) so no cascading effect is needed.
  if (session !== null && clock.session !== session) {
    setClock({ session, t: range!.startMs, playing: false });
  }
  const t = clock.session !== "" && clock.session === session ? clock.t : null;
  const playing = clock.playing && clock.session === session;
  const setT = (next: number): void =>
    setClock((prev) => ({ ...prev, t: next }));
  const setPlaying = (next: boolean | ((was: boolean) => boolean)): void =>
    setClock((prev) => ({
      ...prev,
      playing: typeof next === "function" ? next(prev.playing) : next,
    }));
  const [speedMultiplier, setSpeedMultiplier] = useState(3600);
  const speedRef = useRef(3600);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const tRef = useRef<number | null>(null);
  const playingRef = useRef(false);

  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

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

  // Rebuild route + pin geometry when the timeline changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !timeline) return;

    if (!map.getSource(ROUTE_SOURCE)) {
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

    (map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection" as const,
      features: routeGeometry(timeline).map((line) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: line.coordinates },
      })),
    });

    const placesById = new Map(places.map((p) => [p.id, p]));
    (map.getSource(PINS_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection" as const,
      features: timeline.arrivals.map(({ visitId, atMs }) => {
        const visit = visits.find((v) => v.id === visitId)!;
        const place = placesById.get(visit.placeId)!;
        return {
          type: "Feature" as const,
          properties: {
            visitId,
            arrivalMs: atMs,
            name: place.name || place.id,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [place.lng, place.lat],
          },
        };
      }),
    });

    fitToRoute(map);
  }, [timeline, mapReady, places, visits]);

  // Per-frame render(t): dot position, popped-pin filter, camera follow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !timeline || t === null) return;

    const filter = [
      "<=",
      ["get", "arrivalMs"],
      t,
    ] as unknown as ExpressionSpecification;
    if (map.getLayer(PINS_LAYER)) map.setFilter(PINS_LAYER, filter);

    const frame = renderAt(timeline, t);
    const dotData = frame.dot
      ? {
          type: "FeatureCollection" as const,
          features: [
            {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "Point" as const,
                coordinates: [frame.dot.lng, frame.dot.lat],
              },
            },
          ],
        }
      : EMPTY_FC;
    if (map.getSource(DOT_SOURCE)) {
      (map.getSource(DOT_SOURCE) as GeoJSONSource).setData(dotData);
    }

    if (playingRef.current && followRef.current && frame.dot) {
      map.jumpTo({ center: [frame.dot.lng, frame.dot.lat] });
    }
  }, [t, timeline, mapReady]);

  // The animation loop: deterministic engine + wall-clock delta only.
  useEffect(() => {
    if (!playing || !timeline) return;
    let raf = 0;
    let lastWallClockMs = performance.now();
    const step = (now: number) => {
      const deltaMs = now - lastWallClockMs;
      lastWallClockMs = now;
      const previous = tRef.current ?? timeline.rangeStartMs;
      const next = previous + deltaMs * speedRef.current;
      if (next >= timeline.rangeEndMs) {
        tRef.current = timeline.rangeEndMs;
        setT(timeline.rangeEndMs);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline]);

  if (visits.length === 0 || !range) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium">Nothing to play back yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Import your Google Timeline first — playback animates the journeys
            between your imported visits.
          </p>
          <Link
            to="/import"
            className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            Import now
          </Link>
        </div>
      </div>
    );
  }

  const frame = timeline && t !== null ? renderAt(timeline, t) : null;
  const scrubFraction =
    timeline && t !== null
      ? Math.min(
          1,
          Math.max(0, (t - timeline.rangeStartMs) / (timeline.rangeEndMs - timeline.rangeStartMs)),
        )
      : 0;

  function scrub(fraction: number): void {
    if (!timeline) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    const next =
      timeline.rangeStartMs +
      clamped * (timeline.rangeEndMs - timeline.rangeStartMs);
    tRef.current = next;
    setT(next);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {frame?.dot && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-card/95 px-3 py-1.5 text-xs shadow">
          {frame.phase === "stay"
            ? `Staying at ${placeName(places, frame.activePlaceId)}`
            : frame.phase === "travel"
              ? "In transit…"
              : ""}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          <input
            aria-label="Scrub through time"
            type="range"
            min={0}
            max={1000}
            value={Math.round(scrubFraction * 1000)}
            onChange={(event) =>
              scrub(Number(event.target.value) / 1000)
            }
            className="w-full accent-primary"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
              onClick={() => setPlaying((was) => !was)}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <select
              aria-label="Playback speed"
              value={speedMultiplier}
              onChange={(event) => setSpeedMultiplier(Number(event.target.value))}
              className="h-8 rounded-md border border-border bg-background px-1.5"
            >
              {SPEEDS.map((speed) => (
                <option key={speed.multiplier} value={speed.multiplier}>
                  {speed.label}
                </option>
              ))}
            </select>
            <span className="tabular-nums text-muted-foreground">
              {t !== null ? READOUT_FORMAT.format(new Date(t)) : "—"}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {frame?.arrivedCount ?? 0}/{totalInRange} visits
            </span>
            <label className="ml-auto flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.target.checked)}
              />
              Follow dot
            </label>
            <label className="flex items-center gap-1.5">
              From
              <input
                type="date"
                value={toDayKeyInput(range.startMs)}
                max={toDayKeyInput(range.endMs)}
                onChange={(event) => setCustomFrom(event.target.value || null)}
                className="h-8 rounded-md border border-border bg-background px-1.5"
              />
            </label>
            <label className="flex items-center gap-1.5">
              To
              <input
                type="date"
                value={toDayKeyInput(range.endMs)}
                min={toDayKeyInput(range.startMs)}
                onChange={(event) => setCustomTo(event.target.value || null)}
                className="h-8 rounded-md border border-border bg-background px-1.5"
              />
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            A reconstruction drawn from your visits and breadcrumbs — not a
            replay of recorded movement.
          </p>
        </div>
      </div>
    </div>
  );
}

function endOfDayMs(dayKeyStr: string): number {
  return dayKeyToDate(dayKeyStr).getTime() + 86_400_000 - 1;
}

function toDayKeyInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function placeName(places: Place[], placeId: string | null): string {
  if (!placeId) return "somewhere";
  return places.find((p) => p.id === placeId)?.name || "unnamed place";
}

function fitToRoute(map: MaplibreMap): void {
  const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  void source.getData().then((data) => {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const feature of data.features) {
      const coords =
        feature.geometry.type === "LineString"
          ? feature.geometry.coordinates
          : [feature.geometry.coordinates];
      for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      }
    }
    if (minLng === Infinity) return;
    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 60, duration: 0, maxZoom: 12 },
    );
  });
}
