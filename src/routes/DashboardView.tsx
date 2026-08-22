import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDb } from "@/db/db";
import { getHomePlace } from "@/db/repo";
import {
  availableYears,
  daysAwayFromHome,
  monthStripDensity,
  topPlacesByDwell,
} from "@/features/dashboard/stats";
import { cn } from "@/lib/cn";

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

export default function DashboardView() {
  const navigate = useNavigate();
  const places = useLiveQuery(() => getDb().places.toArray(), [], []);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], []);
  const home = useLiveQuery(() => getHomePlace(), [], undefined);

  const years = useMemo(() => availableYears(visits), [visits]);
  const [year, setYear] = useState<number | null>(null);
  const [mountedAtMs] = useState(() => Date.now());
  const selectedYear = year ?? years[years.length - 1];

  if (visits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium">Nothing to show yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Your dashboard fills up once you import a Google Timeline export.
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

  const daysAway = home ? daysAwayFromHome(visits, home.id, { clampEndMs: mountedAtMs }) : null;
  const top = topPlacesByDwell(visits, places, 5, mountedAtMs);
  const density = monthStripDensity(
    visits,
    selectedYear ?? new Date().getFullYear(),
  );
  const maxDensity = Math.max(1, ...density);

  return (
    <div className="mx-auto max-w-4xl space-y-4 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {!home && (
        <section className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">No Home declared</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open any pin on the map and choose “Set as home”. Days-away stats
            need exactly one Home — nksha never guesses it for you.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Days away from Home</h2>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {home ? daysAway : "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {home
            ? `Calendar days spent away from ${home.name}, across all your data`
            : "Declare a Home from any map pin to unlock this card"}
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Top places</h2>
        <ol className="mt-3 space-y-2">
          {top.map((entry) => (
            <li key={entry.place.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{entry.place.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatDuration(entry.totalDwellMs)}
                <span className="ml-2 text-xs">
                  ({entry.visitCount} {entry.visitCount === 1 ? "visit" : "visits"})
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{selectedYear}</h2>
          {years.length > 1 && (
            <select
              aria-label="Year"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={selectedYear}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[...years].reverse().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-3 grid grid-cols-12 gap-1.5">
          {density.map((count, index) => {
            const monthKey = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
            const intensity = count / maxDensity;
            return (
              <button
                key={monthKey}
                type="button"
                title={`${monthKey}: ${count} ${count === 1 ? "day" : "days"} away`}
                aria-label={`Focus ${monthKey}`}
                disabled={count === 0}
                onClick={() => navigate(`/?month=${monthKey}`)}
                className={cn(
                  "flex h-14 items-end justify-center rounded-md border text-[10px] transition-colors",
                  count === 0
                    ? "border-border opacity-50"
                    : "border-transparent hover:ring-2 hover:ring-ring",
                )}
                style={
                  count > 0
                    ? { backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(25 + intensity * 75)}%, transparent)` }
                    : undefined
                }
              >
                <span className={cn("pb-0.5", count > 0 && "text-primary-foreground")}>
                  {MONTH_LABELS[index]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cells shade by visited days; click one to focus that month on the map.
        </p>
      </section>
    </div>
  );
}
