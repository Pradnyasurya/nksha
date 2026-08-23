import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Home, Play, Search, Sparkles } from "lucide-react";
import { getDb } from "@/db/db";
import type { Place, Trip, Visit } from "@/db/schema";
import {
  createDeclaredTrip,
  deleteTrip,
  dismissInferredTrip,
  getHomePlace,
  renameTrip,
  rerunTripInference,
  setHomePlace,
  tripsByStart,
} from "@/db/repo";
import { visitsInTrip, suggestTripName } from "@/features/trips/trips";
import { cn } from "@/lib/cn";

/**
 * Stories — the library of Trips. Suggested Trips await review with clear
 * Accept / Dismiss actions; confirmed Trips can be renamed or deleted.
 */
export default function TripsView() {
  const trips = useLiveQuery(() => tripsByStart(), [], [] as Trip[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const home = useLiveQuery(() => getHomePlace(), [], undefined as Place | undefined);
  const [rerunResult, setRerunResult] = useState<number | null>(null);

  // Focused creation flow instead of a permanently open form (#stories).
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createDeclaredTrip(name, startDay, endDay);
      setName("");
      setStartDay("");
      setEndDay("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const windowVisitCount =
    startDay && endDay ? visitsInTrip(visits, startDay, endDay).length : null;

  // Inference needs a declared Home (#trips-onboarding): without one it can
  // never know what "away" means. Explain that instead of a silent no-op.
  const hasVisits = visits.length > 0;
  const hasHome = home !== undefined;
  const prerequisitesMet = hasVisits && hasHome;

  async function acceptHomeAndInfer(placeId: string): Promise<void> {
    await setHomePlace(placeId);
    setRerunning(true);
    try {
      setRerunResult(await rerunTripInference());
    } finally {
      setRerunning(false);
    }
  }

  async function rerun(): Promise<void> {
    setRerunning(true);
    try {
      const created = await rerunTripInference();
      setRerunResult(created);
    } finally {
      setRerunning(false);
    }
  }

  const suggested = trips.filter((t) => t.provenance === "inferred");
  const created = trips.filter((t) => t.provenance !== "inferred");

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-6 overflow-y-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Stories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every Trip is a time-bounded story your map can replay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prerequisitesMet && (
            <button
              type="button"
              disabled={rerunning}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              onClick={() => void rerun()}
            >
              <Sparkles size={15} aria-hidden />
              {rerunning ? "Finding…" : "Find trips again"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            aria-expanded={creating}
            className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Create trip
          </button>
        </div>
      </header>

      {/* Prerequisites: one concise setup card, Home picker embedded. */}
      {!prerequisitesMet && (
        <section
          aria-label="Story suggestions setup"
          className="rounded-card border border-border bg-card p-5"
        >
          <p className="font-medium">Suggested stories need two things:</p>
          <ul className="mt-2 space-y-1 pl-5 text-muted-foreground">
            <li>
              Visits in your timeline —{" "}
              {hasVisits ? (
                <span className="font-medium text-positive">done</span>
              ) : (
                <>
                  <Link to="/import" className="text-primary underline underline-offset-2">
                    choose a timeline file
                  </Link>{" "}
                  first
                </>
              )}
            </li>
            <li>
              A declared Home —{" "}
              {hasHome ? (
                <span className="font-medium text-positive">{home!.name || "set"}</span>
              ) : (
                "not chosen yet"
              )}
            </li>
          </ul>
          {!hasHome && hasVisits && places.length > 0 && (
            <div className="mt-4">
              <ChooseHome
                places={places}
                onChosen={(placeId) => void acceptHomeAndInfer(placeId)}
              />
            </div>
          )}
        </section>
      )}

      {rerunResult !== null && (
        <p role="status" className="rounded-xl bg-muted p-3 text-sm">
          {rerunResult === 0
            ? "No new stories matched — time away from Home beyond the minimum stay. You can still create one manually."
            : `Suggested ${rerunResult} ${rerunResult === 1 ? "story" : "stories"} from days spent away from Home.`}
        </p>
      )}

      {/* Focused creation form. */}
      {creating && (
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-3 rounded-card border border-border bg-card p-5 sm:grid-cols-[1fr_auto]"
        >
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Name{" "}
            <span className="font-normal text-muted-foreground">
              (optional — we will pick one from the dates)
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A week in Himachal"
              className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
              From
              <input
                type="date"
                required
                value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
                className="h-11 rounded-md border border-border bg-background px-2 text-[15px]"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
              To
              <input
                type="date"
                required
                value={endDay}
                onChange={(e) => setEndDay(e.target.value)}
                className="h-11 rounded-md border border-border bg-background px-2 text-[15px]"
              />
            </label>
            <button
              type="submit"
              disabled={!startDay || !endDay}
              className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              Create trip
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
          {windowVisitCount !== null && !error && (
            <p
              role="status"
              className="text-sm text-muted-foreground tabular sm:col-span-2"
            >
              This window includes {windowVisitCount}{" "}
              {windowVisitCount === 1 ? "visit" : "visits"} from your timeline.
            </p>
          )}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Every visit inside the window belongs to this trip. Overlapping
            windows are rejected — a visit belongs to at most one trip.
          </p>
        </form>
      )}

      {trips.length === 0 && prerequisitesMet && rerunResult === 0 && (
        <p className="rounded-card border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No stories matched the current rules. You can still create one with
          the button above.
        </p>
      )}
      {trips.length === 0 && rerunResult !== 0 && !prerequisitesMet && (
        <p className="rounded-card border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No stories yet. Create one above, or{" "}
          <Link to="/import" className="text-primary underline underline-offset-2">
            import your timeline
          </Link>{" "}
          to enable automatic suggestions later.
        </p>
      )}

      {suggested.length > 0 && (
        <section aria-label="Suggested stories" className="space-y-3">
          <h2 className="section-title">Suggested</h2>
          <ul className="space-y-2">
            {suggested.map((trip) => (
              <TripRow key={trip.id} trip={trip} visitCount={visitsInTrip(visits, trip.startDay, trip.endDay).length} />
            ))}
          </ul>
        </section>
      )}

      {created.length > 0 && (
        <section aria-label="Stories created by you" className="space-y-3">
          <h2 className="section-title">Created by you</h2>
          <ul className="space-y-2">
            {created.map((trip) => (
              <TripRow key={trip.id} trip={trip} visitCount={visitsInTrip(visits, trip.startDay, trip.endDay).length} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Searchable Home picker (#choose-home): a text-first alternative to hunting
 * for a map pin. Lists every known place; picking one flags it as Home and
 * immediately re-runs inference so the payoff is visible in place.
 */
function ChooseHome({
  places,
  onChosen,
}: {
  places: Place[];
  onChosen: (placeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = [...places].sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
    if (!q) return pool.slice(0, 30);
    return pool
      .filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [places, query]);

  return (
    <div data-testid="choose-home">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Home size={16} aria-hidden /> Choose Home
        </button>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your places…"
              aria-label="Search places to choose Home"
              className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-[15px]"
            />
          </div>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No places match “{query}”.
            </p>
          ) : (
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {matches.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChosen(place.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[15px] hover:bg-muted"
                  >
                    <Home size={14} aria-hidden className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">
                      {place.name || "Unnamed place"}
                      <span className="block truncate text-xs text-muted-foreground">
                        {place.address}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TripRow({ trip, visitCount }: { trip: Trip; visitCount: number }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(trip.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isInferred = trip.provenance === "inferred";

  const durationDays = tripDurationDays(trip.startDay, trip.endDay);

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void renameTrip(trip.id, draft.trim() || suggestTripName(trip.startDay, trip.endDay)).then(
                () => setRenaming(false),
              );
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[15px]"
              aria-label="Trip name"
            />
            <button type="submit" className="h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground">
              Save
            </button>
          </form>
        ) : (
          <>
            <p className="truncate font-display text-lg font-semibold">{trip.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground tabular">
              {trip.startDay} – {trip.endDay} · {durationDays}{" "}
              {durationDays === 1 ? "day" : "days"} · {visitCount}{" "}
              {visitCount === 1 ? "visit" : "visits"}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {!renaming && (
          <>
            <Link
              to={`/playback`}
              state={{ tripId: trip.id }}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:opacity-90"
            >
              <Play size={13} aria-hidden /> Play
            </Link>
            <button
              type="button"
              aria-label={`Rename ${trip.name}`}
              className="min-h-10 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                setDraft(trip.name);
                setRenaming(true);
              }}
            >
              Rename
            </button>
          </>
        )}
        {confirmingDelete ? (
          <>
            <button
              type="button"
              className="min-h-10 rounded-lg bg-destructive px-2.5 py-1.5 text-sm text-white"
              onClick={() =>
                void (isInferred
                  ? dismissInferredTrip(trip.id)
                  : deleteTrip(trip.id))
              }
            >
              {isInferred ? "Dismiss suggestion" : "Delete trip"}
            </button>
            <button
              type="button"
              className="min-h-10 rounded-lg border border-border px-2.5 py-1.5 text-sm"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label={isInferred ? `Dismiss ${trip.name}` : `Delete ${trip.name}`}
            title={
              isInferred
                ? "This was suggested automatically — dismissing it is safe."
                : "You created this trip yourself."
            }
            className="flex min-h-10 items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
            onClick={() => setConfirmingDelete(true)}
          >
            {isInferred ? (
              <>Dismiss</>
            ) : (
              <>
                Delete
              </>
            )}
          </button>
        )}
      </div>

      {confirmingDelete && (
        <p className={cn("text-xs text-muted-foreground sm:hidden")}>
          {isInferred
            ? "Dismissing removes only this suggestion — your visits stay."
            : "Deleting removes this trip. Your visits and places stay."}
        </p>
      )}
    </li>
  );
}

function tripDurationDays(startDay: string, endDay: string): number {
  const start = new Date(`${startDay}T00:00:00`).getTime();
  const end = new Date(`${endDay}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}
