import { useMemo, useState } from "react";
import type { Place, Trip, Visit } from "@/db/schema";
import { renamePlace, setHomePlace } from "@/db/repo";
import { yearColor } from "@/features/map/visitsLayer";

interface VisitDetailCardProps {
  place: Place;
  visit: Visit;
  /** Full history — enables the aggregate place summary (#map-hero). */
  visits?: Visit[];
  /** Trips overlapping this place's history (#map-hero). */
  trips?: Trip[];
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

export function VisitDetailCard({
  place,
  visit,
  visits,
  trips,
  onClose,
}: VisitDetailCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(place.name);
  const [error, setError] = useState<string | null>(null);
  // Stable per-mount clock for open-ended stays (React-documented pattern).
  const [mountedAtMs] = useState(() => Date.now());

  // Aggregate story for this place across all of the user's history.
  const summary = useMemo(() => {
    if (!visits) return null;
    const here = visits
      .filter((v) => v.placeId === place.id)
      .sort((a, b) => a.startTimeMs - b.startTimeMs);
    if (here.length === 0) return null;
    const totalDwellMs = here.reduce(
      (sum, v) =>
        sum +
        Math.max(
          0,
          Math.min(v.endTimeMs ?? mountedAtMs, mountedAtMs) - v.startTimeMs,
        ),
      0,
    );
    return {
      count: here.length,
      totalDwellMs,
      firstMs: here[0].startTimeMs,
      lastMs: here[here.length - 1].startTimeMs,
    };
  }, [visits, place.id, mountedAtMs]);

  const relatedTrips = useMemo(() => {
    if (!trips || !visit) return [];
    return trips.filter(
      (t) =>
        t.startDay <= dayKeyOf(visit.endTimeMs ?? visit.startTimeMs) &&
        dayKeyOf(visit.startTimeMs) <= t.endDay,
    );
  }, [trips, visit]);

  async function submitRename() {
    const next = nameDraft.trim();
    if (!next || next === place.name) {
      setRenaming(false);
      return;
    }
    try {
      await renamePlace(place.id, next);
      setRenaming(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <aside className="absolute bottom-36 left-3 right-3 z-10 max-h-[60%] overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg sm:bottom-auto sm:left-4 sm:right-auto sm:top-4 sm:w-80">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-base font-semibold leading-snug">
          {place.name}
          {place.isHome === 1 && (
            <span className="ml-1.5 align-middle text-[10px] font-normal text-primary">
              ★ Home
            </span>
          )}
        </h2>
        <span
          aria-hidden
          title={`Visited in ${new Date(visit.startTimeMs).getFullYear()}`}
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: yearColor(new Date(visit.startTimeMs).getFullYear()) }}
        />
        <button
          type="button"
          aria-label="Close details"
          className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {place.address && (
        <p className="mt-1 text-xs text-muted-foreground">{place.address}</p>
      )}

      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Arrival</dt>
          <dd>{DATE_TIME.format(new Date(visit.startTimeMs))}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Departure</dt>
          <dd>
            {visit.endTimeMs === null
              ? "still here"
              : DATE_TIME.format(new Date(visit.endTimeMs))}
          </dd>
        </div>
      </dl>

      {summary && summary.count > 1 && (
        <>
          <h3 className="mt-3 border-t border-border pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Across your years
          </h3>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div>
              <dt className="text-muted-foreground">Visits</dt>
              <dd className="tabular-nums">{summary.count}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total time</dt>
              <dd className="tabular-nums">{formatDuration(summary.totalDwellMs)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">First visit</dt>
              <dd>{DATE_ONLY.format(new Date(summary.firstMs))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last visit</dt>
              <dd>{DATE_ONLY.format(new Date(summary.lastMs))}</dd>
            </div>
          </dl>
        </>
      )}

      {relatedTrips.length > 0 && (
        <>
          <h3 className="mt-3 border-t border-border pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Related trips
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {relatedTrips.map((trip) => (
              <li
                key={trip.id}
                className="rounded-full border border-border px-2 py-0.5 text-[11px]"
                title={`${trip.startDay} – ${trip.endDay}`}
              >
                {trip.name}
              </li>
            ))}
          </ul>
        </>
      )}

      {renaming ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitRename();
          }}
        >
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Place name"
          />
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              setNameDraft(place.name);
              setRenaming(true);
            }}
          >
            Rename place
          </button>
          {place.isHome === 0 && (
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
              onClick={() => void setHomePlace(place.id)}
            >
              Set as home
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </aside>
  );
}

function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_ONLY = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});
