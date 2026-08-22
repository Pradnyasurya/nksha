import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bike,
  Car,
  Compass,
  Footprints,
  Plus,
  TrainFront,
  X,
} from "lucide-react";
import { getDb } from "@/db/db";
import type { MovementMode } from "@/db/schema";
import {
  addManualCountry,
  getHomePlace,
  getManualCountries,
  removeManualCountry,
} from "@/db/repo";
import { useDetectedCountries } from "@/features/countries/useDetectedCountries";
import {
  availableYears,
  daysAwayFromHome,
  distanceByMode,
  farthestPlaceFromHome,
  monthStripDensity,
  topPlacesByDwell,
  type DwellRanking,
  type ModeDistance,
} from "@/features/dashboard/stats";
import { MODE_LABELS } from "@/features/movement/modes";
import { cn } from "@/lib/cn";

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const MODE_ICONS: Record<MovementMode, typeof Car> = {
  driving: Car,
  walking: Footprints,
  cycling: Bike,
  transit: TrainFront,
  other: Compass,
};

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function isValidIsoA3(value: string): boolean {
  return /^[A-Za-z]{3}$/.test(value.trim());
}

/**
 * Lead with sentences, not a wall of metrics (#dashboard-narrative).
 * Every line is derived from the user's own imported data.
 */
function buildNarrative(input: {
  daysAway: number | null;
  homeName?: string;
  top: DwellRanking[];
  modeDistances: ModeDistance[];
  countryCount: number;
}): string[] {
  const lines: string[] = [];
  if (input.daysAway !== null) {
    lines.push(
      `You spent ${input.daysAway} ${input.daysAway === 1 ? "day" : "days"} away from ${
        input.homeName ?? "home"
      }.`,
    );
  }
  const best = input.top[0];
  if (best) {
    lines.push(
      `${best.place.name || "Your most-visited place"} held you longest — ${formatDuration(
        best.totalDwellMs,
      )} across ${best.visitCount} ${best.visitCount === 1 ? "visit" : "visits"}.`,
    );
  }
  const leadMode = input.modeDistances[0];
  if (leadMode && leadMode.distanceMeters > 0) {
    lines.push(
      `You covered the most ground by ${MODE_LABELS[leadMode.mode].toLowerCase()} — ${formatDistance(
        leadMode.distanceMeters,
      ).replace(" km", " kilometres")}.`,
    );
  }
  if (input.countryCount > 0) {
    lines.push(
      `Your map touches ${input.countryCount} ${
        input.countryCount === 1 ? "country" : "countries"
      }.`,
    );
  }
  return lines;
}

/** Clearly-marked synthetic numbers so the empty dashboard still sells. */
function SampleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        aria-hidden
        className="mt-2 select-none text-3xl font-semibold tabular-nums opacity-60 blur-[2px]"
      >
        {value}
      </p>
    </div>
  );
}

export default function DashboardView() {
  const navigate = useNavigate();
  const places = useLiveQuery(() => getDb().places.toArray(), [], []);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], []);
  const movements = useLiveQuery(() => getDb().movements.toArray(), [], []);
  const home = useLiveQuery(() => getHomePlace(), [], undefined);
  const manualCountries = useLiveQuery(() => getManualCountries(), [], [] as string[]);
  const { detected, names, status: countryStatus } = useDetectedCountries(places);

  const years = useMemo(() => availableYears(visits), [visits]);
  const [year, setYear] = useState<number | null>(null);
  const [mountedAtMs] = useState(() => Date.now());
  const selectedYear = year ?? years[years.length - 1];

  const modeDistances = useMemo(() => distanceByMode(movements), [movements]);
  const farthest = useMemo(
    () => (home ? farthestPlaceFromHome(visits, places, home.id) : null),
    [visits, places, home],
  );
  const countryCodes = useMemo(() => {
    const merged = new Set(detected);
    for (const code of manualCountries) merged.add(code.toUpperCase());
    return [...merged].sort((a, b) =>
      (names[a] ?? a).localeCompare(names[b] ?? b),
    );
  }, [detected, manualCountries, names]);

  if (visits.length === 0) {
    return (
      <div className="paper-texture h-full min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-xl p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Once your timeline is in, this page answers questions like these —
            previewed below with sample numbers.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
            <SampleCard label="Days away from home" value="43" />
            <SampleCard label="Top place dwell" value="212 h" />
            <SampleCard label="Kilometres driven" value="8,940" />
            <SampleCard label="Countries touched" value="11" />
            <SampleCard label="Trips inferred" value="19" />
            <SampleCard label="Years mapped" value="8" />
          </div>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
            Sample values — your real numbers appear after import
          </p>

          <Link
            to="/import"
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground hover:opacity-90"
          >
            Import your timeline
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
  const narrative = buildNarrative({
    daysAway,
    homeName: home?.name,
    top,
    modeDistances,
    countryCount: countryCodes.length,
  });

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-4 overflow-y-auto p-4 sm:p-6">
      <h1 className="font-display text-2xl font-semibold">Insights</h1>

      {narrative.length > 0 && (
        <section
          aria-label="Your year in brief"
          className="rounded-lg border border-primary/30 bg-accent/60 p-4"
        >
          {narrative.map((line, index) => (
            <p
              key={index}
              className={
                index === 0
                  ? "font-display text-lg font-semibold leading-snug"
                  : "mt-1.5 text-sm text-muted-foreground"
              }
            >
              {line}
            </p>
          ))}
        </section>
      )}

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
        <h2 className="text-sm font-medium">Distance by mode</h2>
        {modeDistances.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No travel distances yet — they come from activity segments in your
            Timeline import.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {modeDistances.map((entry) => {
              const Icon = MODE_ICONS[entry.mode];
              return (
                <li key={entry.mode} className="flex items-center gap-2 text-sm">
                  <Icon size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span>{MODE_LABELS[entry.mode]}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                    {formatDistance(entry.distanceMeters)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Farthest place from Home</h2>
        {farthest ? (
          <p className="mt-2 text-sm" data-testid="farthest-place">
            <span className="font-semibold">{farthest.place.name}</span>{" "}
            <span className="tabular-nums text-muted-foreground">
              · {formatDistance(farthest.distanceMeters)} from {home?.name}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {home
              ? "Visit somewhere farther to fill this card."
              : "Declare a Home first — nksha never guesses it."}
          </p>
        )}
      </section>

      <CountriesCard
        codes={countryCodes}
        names={names}
        manual={manualCountries}
        status={countryStatus}
      />

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{selectedYear}</h2>
          {years.length > 1 && (
            <select
              aria-label="Year"
              className="h-11 rounded-md border border-border bg-background px-2 text-xs"
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

function CountriesCard({
  codes,
  names,
  manual,
  status,
}: {
  codes: string[];
  names: Record<string, string>;
  manual: string[];
  status: "working" | "done" | "error";
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addManual(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const code = draft.trim().toUpperCase();
    if (!isValidIsoA3(code)) {
      setError("Use a three-letter country code, e.g. ARE or CHE.");
      return;
    }
    if (codes.includes(code)) {
      setError(`${code} is already on the list.`);
      return;
    }
    setError(null);
    await addManualCountry(code);
    setDraft("");
  }

  const manualSet = new Set(manual.map((c) => c.toUpperCase()));

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Countries visited</h2>
      {status === "error" && (
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          Country detection failed — manual entries still work.
        </p>
      )}
      {codes.length === 0 && status !== "error" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "working"
            ? "Matching your places against country polygons…"
            : "No countries detected yet."}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {codes.length} {codes.length === 1 ? "country" : "countries"} ·{" "}
          {manualSet.size} added by hand
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {codes.map((code) => {
          const isManual = manualSet.has(code);
          return (
            <li
              key={code}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs"
            >
              <span>{names[code] ?? code}</span>
              <span className="text-[10px] text-muted-foreground">{code}</span>
              {isManual && (
                <button
                  type="button"
                  aria-label={`Remove ${names[code] ?? code}`}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                  onClick={() => void removeManualCountry(code)}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={(e) => void addManual(e)} className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          placeholder="Add a country (ISO code)"
          aria-label="Add a country manually"
          maxLength={3}
          className="h-11 w-40 rounded-md border border-border bg-background px-2 text-sm sm:w-56"
        />
        <button
          type="submit"
          className="flex h-11 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted"
        >
          <Plus size={13} aria-hidden /> Add manually
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Detected from your places with a ~50 km coastal snap; layovers and
        disputed borders can be added by hand and are never revoked by imports.
      </p>
    </section>
  );
}
