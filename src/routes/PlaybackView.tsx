import { useLiveQuery } from "dexie-react-hooks";
import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ListVideo, Play } from "lucide-react";
import { getDb } from "@/db/db";
import type { Place, Visit } from "@/db/schema";
import { getBasemapStyle } from "@/db/repo";
import {
  buildPlaybackTimeline,
  defaultPlaybackRange,
  renderAt,
  travelledDistanceMeters,
} from "@/features/playback/engine";
import {
  applyDot,
  applyPinVisibility,
  ensurePlaybackLayers,
  setPinData,
  setRouteData,
  waitForRender,
} from "@/features/playback/mapLayers";
import { buildCartoStyle } from "@/features/map/mapStyles";
import { dayKeyToDate } from "@/lib/days";
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  exceedsSuggestedDuration,
  frameTimeMs,
  planExport,
  type ExportPlan,
} from "@/features/export/framePlanner";
// mp4-muxer + WebCodecs glue load only when the user actually exports
// (#bundle-budget) — it is one of the heavier chunks.
const lazyVideoExport = () => import("@/features/export/videoExport");
import { cn } from "@/lib/cn";

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

const DATE_ONLY = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

type ExportState =
  | { phase: "idle" }
  | { phase: "confirming"; plan: ExportPlan }
  | { phase: "running"; done: number; total: number }
  | { phase: "error"; message: string };

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
  const [startedSession, setStartedSession] = useState("");
  const started = session !== null && startedSession === session;
  const [showChapters, setShowChapters] = useState(false);
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
  const [exportState, setExportState] = useState<ExportState>({ phase: "idle" });
  const exportCancelRef = useRef(false);

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

    ensurePlaybackLayers(map);
    setRouteData(map, timeline);
    setPinData(map, timeline, visits, places);

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const segment of timeline.segments) {
      if (segment.kind !== "travel") continue;
      for (const p of segment.points) {
        minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
        minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      }
    }
    if (minLng !== Infinity) {
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 60, duration: 0, maxZoom: 12 },
      );
    }
  }, [timeline, mapReady, places, visits]);

  // Per-frame render(t): dot position, popped-pin filter, camera follow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !timeline || t === null) return;

    applyPinVisibility(map, t);
    const frame = renderAt(timeline, t);
    applyDot(map, frame.dot);

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

  async function startExport(plan: ExportPlan): Promise<void> {
    if (!timeline || !range) return;
    exportCancelRef.current = false;
    setPlaying(false);
    setExportState({ phase: "running", done: 0, total: plan.frameCount });

    const snapshotTimeline = timeline;
    const snapshotVisits = visits;
    const snapshotPlaces = places;

    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      left: "-99999px",
      top: "0",
      width: `${EXPORT_WIDTH}px`,
      height: `${EXPORT_HEIGHT}px`,
    });
    document.body.appendChild(host);

    let captureMap: MaplibreMap | null = null;
    try {
      captureMap = new MaplibreMap({
        container: host,
        style: buildCartoStyle(preference === "light" ? "light" : "dark"),
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
      });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Basemap failed to load in time")),
          15_000,
        );
        captureMap!.once("load", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      ensurePlaybackLayers(captureMap);
      setRouteData(captureMap, snapshotTimeline);
      setPinData(captureMap, snapshotTimeline, snapshotVisits, snapshotPlaces);

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const segment of snapshotTimeline.segments) {
        if (segment.kind !== "travel") continue;
        for (const p of segment.points) {
          minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
          minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
        }
      }
      let routeZoom = captureMap.getZoom();
      if (minLng !== Infinity) {
        captureMap.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 80, duration: 0, maxZoom: 12 },
        );
        routeZoom = captureMap.getZoom();
        await waitForRender(captureMap);
      }

      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;
      const ctx2d = canvas.getContext("2d");

      const { encodePlaybackVideo } = await lazyVideoExport();
      const result = await encodePlaybackVideo({
        plan,
        fallbackCanvas: canvas,
        drawFrame: async (index) => {
          const frameT = frameTimeMs(plan, range.startMs, index);
          const frame = renderAt(snapshotTimeline, frameT);
          applyPinVisibility(captureMap!, frameT);
          applyDot(captureMap!, frame.dot);
          if (frame.dot) {
            captureMap!.jumpTo({
              center: [frame.dot.lng, frame.dot.lat],
              zoom: routeZoom,
            });
          }
          await waitForRender(captureMap!);
          ctx2d?.drawImage(captureMap!.getCanvas(), 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
          return canvas;
        },
        onProgress: (done, total) =>
          setExportState({ phase: "running", done, total }),
        shouldCancel: () => exportCancelRef.current,
      });

      downloadBlob(result.blob, playbackFileName(range, result.extension));
      setExportState({ phase: "idle" });
    } catch (error) {
      if (await lazyVideoExport().then((m) => error instanceof m.ExportCancelledError)) {
        setExportState({ phase: "idle" });
      } else {
        setExportState({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      captureMap?.remove();
      host.remove();
    }
  }

  function beginExportRequest(): void {
    if (!range) return;
    const plan = planExport(range.startMs, range.endMs, speedMultiplier);
    if (exceedsSuggestedDuration(plan)) {
      setExportState({ phase: "confirming", plan });
    } else {
      void startExport(plan);
    }
  }

  const hasData = visits.length > 0 && !!range;

  // Year presets: one tap to frame the story on a single year.
  const presetYears = useMemo(
    () =>
      [...new Set(visits.map((v) => new Date(v.startTimeMs).getFullYear()))]
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => b - a),
    [visits],
  );

  function applyPreset(year: number | null): void {
    if (year === null) {
      setCustomFrom(null);
      setCustomTo(null);
    } else {
      setCustomFrom(`${year}-01-01`);
      setCustomTo(`${year}-12-31`);
    }
  }

  // Chapters: every arrival is a scene in the story (#playback-story).
  const chapters = useMemo(() => {
    if (!timeline) return [];
    const placeById = new Map(places.map((p) => [p.id, p]));
    const visitById = new Map(visits.map((v) => [v.id ?? -1, v]));
    return timeline.arrivals.map((arrival) => {
      const visit = visitById.get(arrival.visitId);
      const place = visit ? placeById.get(visit.placeId) : undefined;
      return {
        atMs: arrival.atMs,
        name: place?.name || "Unnamed place",
      };
    });
  }, [timeline, places, visits]);

  const tripStats =
    timeline && t !== null
      ? {
          distanceMeters: travelledDistanceMeters(timeline, t),
          elapsedMs: t - timeline.rangeStartMs,
        }
      : null;

  function beginStory(): void {
    if (session === null) return;
    setStartedSession(session);
    setPlaying(true);
  }

  // Focus management (#a11y): while the title card covers the page, the
  // playback controls behind it must not stay keyboard-reachable.
  const titleCardRef = useRef<HTMLDivElement | null>(null);
  const pauseButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (hasData && !started) {
      titleCardRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [hasData, started]);
  useEffect(() => {
    if (playing) pauseButtonRef.current?.focus();
  }, [playing]);

  const frame = timeline && t !== null ? renderAt(timeline, t) : null;
  const scrubFraction =
    timeline && t !== null
      ? Math.min(
          1,
          Math.max(0, (t - timeline.rangeStartMs) / (timeline.rangeEndMs - timeline.rangeStartMs)),
        )
      : 0;
  const exporting = exportState.phase === "running";

  function scrub(fraction: number): void {
    if (!timeline) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    const next =
      timeline.rangeStartMs +
      clamped * (timeline.rangeEndMs - timeline.rangeStartMs);
    tRef.current = next;
    setT(next);
  }

  // The map host must stay mounted on every render: the init effect below has
  // empty deps, so a conditional early-return while visits are still loading
  // would leave the ref null forever and the map would never be created.
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {!hasData && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 p-6 text-center">
          <div>
            <p className="text-sm font-medium">Nothing to play back yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Import your Google Timeline first — playback animates the trips
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
      )}

      {/* Cinematic title card: the story starts deliberately, not abruptly. */}
      {hasData && !started && (
        <div
          ref={titleCardRef}
          role="dialog"
          aria-label="Story title card"
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 p-6 text-center backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              nksha story
            </p>
            <h1 className="font-display text-4xl font-semibold leading-tight">
              {storyTitle(range!)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalInRange} visits ·{" "}
              {Math.round((range!.endMs - range!.startMs) / 86_400_000)} days of
              movement
            </p>
            <button
              type="button"
              onClick={beginStory}
              className="mt-2 flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground shadow hover:opacity-90"
            >
              <Play size={17} aria-hidden /> Begin the trip
            </button>
            <button
              type="button"
              className="min-h-11 px-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => session !== null && setStartedSession(session)}
            >
              Explore the timeline manually instead
            </button>
          </div>
        </div>
      )}

      {frame?.dot && (
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-card/95 px-3 py-1.5 text-xs shadow">
        {frame.phase === "stay"
          ? `Staying at ${placeName(places, frame.activePlaceId)}`
          : frame.phase === "travel"
            ? "In transit…"
            : ""}
      </div>
      )}

      {hasData && (
      <div
        // #a11y: while the title card covers the page, every control behind it
        // is inert — not rendered-focusable by keyboard or assistive tech.
        {...(!started ? { inert: true } : {})}
        className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 p-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-medium">Story:</span>
            <button
              type="button"
              aria-pressed={customFrom === null && customTo === null}
              onClick={() => applyPreset(null)}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5",
                customFrom === null && customTo === null
                  ? "border-primary bg-accent font-medium"
                  : "border-border hover:bg-muted",
              )}
            >
              All time
            </button>
            {presetYears.map((y) => {
              const active = customFrom === `${y}-01-01` && customTo === `${y}-12-31`;
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyPreset(y)}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 tabular-nums",
                    active
                      ? "border-primary bg-accent font-medium"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {y} recap
                </button>
              );
            })}
            {chapters.length > 0 && (
              <button
                type="button"
                aria-expanded={showChapters}
                onClick={() => setShowChapters((v) => !v)}
                className="ml-auto flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted"
              >
                <ListVideo size={14} aria-hidden />
                Chapters ({chapters.length})
              </button>
            )}
          </div>

          {showChapters && chapters.length > 0 && (
            <ol
              aria-label="Trip chapters"
              className="max-h-36 overflow-y-auto rounded-md border border-border bg-background p-1 text-xs"
            >
              {chapters.map((chapter, index) => (
                <li key={`${chapter.atMs}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      tRef.current = chapter.atMs;
                      setT(chapter.atMs);
                    }}
                    className="flex min-h-9 w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="truncate">{chapter.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {DATE_ONLY.format(new Date(chapter.atMs))}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          <input
            aria-label="Scrub through time"
            type="range"
            min={0}
            max={1000}
            value={Math.round(scrubFraction * 1000)}
            disabled={exporting || !started}
            onChange={(event) =>
              scrub(Number(event.target.value) / 1000)
            }
            className="w-full accent-primary"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              ref={pauseButtonRef}
              type="button"
              className="flex min-h-11 items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
              disabled={exporting}
              onClick={() => setPlaying((was) => !was)}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <select
              aria-label="Playback speed"
              value={speedMultiplier}
              disabled={exporting}
              onChange={(event) => setSpeedMultiplier(Number(event.target.value))}
              className="h-11 rounded-md border border-border bg-background px-1.5"
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
            {tripStats && (
              <span className="tabular-nums text-muted-foreground">
                ·{" "}
                {tripStats.distanceMeters >= 1000
                  ? `${Math.round(tripStats.distanceMeters / 1000).toLocaleString()} km travelled`
                  : `${Math.round(tripStats.distanceMeters)} m travelled`}{" "}
                · {formatElapsed(tripStats.elapsedMs)} elapsed
              </span>
            )}
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
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-4 py-2 font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={exporting}
              onClick={beginExportRequest}
            >
              Export MP4
            </button>
          </div>

          {exportState.phase === "confirming" && (
            <div className="rounded-md border border-border bg-background p-3 text-xs" role="alertdialog" aria-label="Long export warning">
              <p>
                At this speed the selected range produces a ~
                {Math.round(exportState.plan.durationSec / 60)} minute video (
                {exportState.plan.frameCount} frames, {EXPORT_WIDTH}×
                {EXPORT_HEIGHT}, ~
                {Math.max(1, Math.round(exportState.plan.frameCount / 30))} s to
                render). Continue?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
                  onClick={() => void startExport(exportState.plan)}
                >
                  Export anyway
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5"
                  onClick={() => setExportState({ phase: "idle" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {exportState.phase === "running" && (
            <div className="rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span role="status">
                  Rendering frame {exportState.done}/{exportState.total}…
                </span>
                <button
                  type="button"
                  className="rounded-md bg-destructive px-2 py-1 text-white"
                  onClick={() => {
                    exportCancelRef.current = true;
                  }}
                >
                  Cancel export
                </button>
              </div>
              <progress
                className="mt-2 w-full"
                value={exportState.done}
                max={exportState.total}
              />
            </div>
          )}

          {exportState.phase === "error" && (
            <div className="rounded-md border border-destructive bg-background p-3 text-xs" role="alert">
              <span>{exportState.message}</span>{" "}
              <button
                type="button"
                className="ml-2 rounded-md border border-border px-2 py-1"
                onClick={() => setExportState({ phase: "idle" })}
              >
                Dismiss
              </button>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            A reconstruction drawn from your visits and breadcrumbs — not a
            replay of recorded movement.
          </p>
        </div>
      </div>
      )}
    </div>
  );
}

function endOfDayMs(dayKeyStr: string): number {
  return dayKeyToDate(dayKeyStr).getTime() + 86_400_000 - 1;
}

/** Cinematic headline for the title card. */
function storyTitle(range: { startMs: number; endMs: number }): string {
  const startYear = new Date(range.startMs).getFullYear();
  const endYear = new Date(range.endMs).getFullYear();
  if (startYear === endYear) return `Your ${startYear}`;
  const years = endYear - startYear;
  return `Your ${years} year${years === 1 ? "" : "s"}, ${startYear}–${endYear}`;
}

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
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

function playbackFileName(
  range: { startMs: number; endMs: number },
  extension: string,
): string {
  return `nksha-playback-${toDayKeyInput(range.startMs)}_${toDayKeyInput(range.endMs)}.${extension}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
