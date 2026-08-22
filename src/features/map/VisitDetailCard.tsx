import { useState } from "react";
import type { Place, Visit } from "@/db/schema";
import { renamePlace, setHomePlace } from "@/db/repo";
import { yearColor } from "@/features/map/visitsLayer";

interface VisitDetailCardProps {
  place: Place;
  visit: Visit;
  onClose: () => void;
}

export function VisitDetailCard({
  place,
  visit,
  onClose,
}: VisitDetailCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(place.name);
  const [error, setError] = useState<string | null>(null);

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
    <aside className="absolute left-4 top-4 z-10 w-72 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold leading-snug">
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
          className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Place name"
          />
          <button
            type="submit"
            className="h-8 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
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
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
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

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
