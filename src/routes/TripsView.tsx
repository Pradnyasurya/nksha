import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getDb } from "@/db/db";
import type { Trip } from "@/db/schema";
import {
  createDeclaredTrip,
  deleteTrip,
  renameTrip,
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

  return (
    <div className="mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Trips</h1>

      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_auto]"
      >
        <label className="flex flex-col gap-1 text-xs">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Himachal"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            From
            <input
              type="date"
              required
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            To
            <input
              type="date"
              required
              value={endDay}
              onChange={(e) => setEndDay(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!startDay || !endDay}
            className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            Declare trip
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Every visit inside the window belongs to this trip. Overlapping
          windows are rejected — a visit belongs to at most one trip.
        </p>
      </form>

      {trips.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No trips yet. Brush a date range above to declare your first one,
          or{" "}
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

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
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
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
              aria-label="Trip name"
            />
            <button type="submit" className="h-8 rounded-md bg-primary px-2 text-xs text-primary-foreground">
              Save
            </button>
          </form>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{trip.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {trip.startDay} – {trip.endDay} · {visitCount}{" "}
              {visitCount === 1 ? "visit" : "visits"}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {trip.provenance}
        </span>
        {!renaming && (
          <button
            type="button"
            aria-label={`Rename ${trip.name}`}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
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
              className="rounded-md bg-destructive px-2 py-1 text-xs text-white"
              onClick={() => void deleteTrip(trip.id)}
            >
              Delete for sure
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label={`Delete ${trip.name}`}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
