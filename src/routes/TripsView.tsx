import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getDb } from "@/db/db";
import type { Trip } from "@/db/schema";
import {
  createDeclaredTrip,
  deleteTrip,
  dismissInferredTrip,
  renameTrip,
  rerunTripInference,
  tripsByStart,
} from "@/db/repo";
import { visitsInTrip, suggestTripName } from "@/features/trips/trips";

export default function TripsView() {
  const trips = useLiveQuery(() => tripsByStart(), [], [] as Trip[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], []);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Live preview of what the window would claim (#trips-preview).
  const windowVisitCount =
    startDay && endDay ? visitsInTrip(visits, startDay, endDay).length : null;

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Trips</h1>
        {visits.length > 0 && (
          <button
            type="button"
            disabled={rerunning}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            onClick={() => {
              setRerunning(true);
              void rerunTripInference().finally(() => setRerunning(false));
            }}
          >
            {rerunning ? "Re-running…" : "Re-run suggestions"}
          </button>
        )}
      </div>

      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_auto]"
      >
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Himachal"
            className="h-11 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            From
            <input
              type="date"
              required
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
              className="h-11 rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            To
            <input
              type="date"
              required
              value={endDay}
              onChange={(e) => setEndDay(e.target.value)}
              className="h-11 rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!startDay || !endDay}
            className="h-11 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
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
            className="text-xs text-muted-foreground sm:col-span-2"
          >
            This window includes {windowVisitCount}{" "}
            {windowVisitCount === 1 ? "visit" : "visits"} from your timeline.
          </p>
        )}
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Every visit inside the window belongs to this trip. Overlapping
          windows are rejected — a visit belongs to at most one trip.
        </p>
      </form>

      {trips.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No trips yet. Create one with the dates above, or{" "}
          <Link to="/import" className="text-primary underline">
            import your timeline
          </Link>{" "}
          to enable automatic suggestions later.
        </p>
      )}

      <ul className="space-y-2">
        {trips.map((trip) => (
          <TripRow
            key={trip.id}
            trip={trip}
            visitCount={visitsInTrip(visits, trip.startDay, trip.endDay).length}
          />
        ))}
      </ul>
    </div>
  );
}

function TripRow({ trip, visitCount }: { trip: Trip; visitCount: number }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(trip.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const durationDays = tripDurationDays(trip.startDay, trip.endDay);

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
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
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
              aria-label="Trip name"
            />
            <button type="submit" className="h-9 rounded-md bg-primary px-2 text-xs text-primary-foreground">
              Save
            </button>
          </form>
        ) : (
          <>
            <p className="truncate font-display text-base font-semibold">{trip.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {trip.startDay} – {trip.endDay} · {durationDays}{" "}
              {durationDays === 1 ? "day" : "days"} · {visitCount}{" "}
              {visitCount === 1 ? "visit" : "visits"}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <span
          className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
          title={
            trip.provenance === "inferred"
              ? "Suggested automatically from gaps in your timeline — dismiss it if it is wrong."
              : "You created this trip yourself."
          }
        >
          {trip.provenance === "inferred" ? "auto-suggested" : "yours"}
        </span>
        {!renaming && (
          <button
            type="button"
            aria-label={`Rename ${trip.name}`}
            className="min-h-11 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              setDraft(trip.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
        )}
        {confirmingDelete ? (
          <>
            <button
              type="button"
              className="min-h-11 rounded-md bg-destructive px-2.5 py-1.5 text-xs text-white"
              onClick={() =>
                void (trip.provenance === "inferred"
                  ? dismissInferredTrip(trip.id)
                  : deleteTrip(trip.id))
              }
            >
              {trip.provenance === "inferred" ? "Dismiss for sure" : "Delete for sure"}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-2.5 py-1.5 text-xs"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label={`Delete ${trip.name}`}
            className="min-h-11 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function tripDurationDays(startDay: string, endDay: string): number {
  const start = new Date(`${startDay}T00:00:00`).getTime();
  const end = new Date(`${endDay}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}
