import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bike,
  Car,
  Compass,
  Footprints,
  Home,
  MapPin,
  Plus,
  Search,
  TrainFront,
  X,
} from "lucide-react";
import { getDb } from "@/db/db";
import type { MovementMode, Place, Visit } from "@/db/schema";
import {
  addManualCountry,
  getHomePlace,
  getManualCountries,
  removeManualCountry,
  setHomePlace,
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

export default function DashboardView() {
  const navigate = useNavigate();
  const places = useLiveQuery(() => getDb().places.toArray(), [], [] as Place[]);
  const visits = useLiveQuery(() => getDb().visits.toArray(), [], [] as Visit[]);
  const movements = useLiveQuery(() => getDb().movements.toArray(), [], []);
  const home = useLiveQuery(() => getHomePlace(), [], undefined as Place | undefined);
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
    // Empty preview: the questions this page will answer — no blurred fake
    // metrics (#insights-empty).
    return (
      <div className="paper-texture h-full min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-xl p-6 text-center">
          <h1 className="page-title">Insights</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Once your timeline is in, this page answers questions like:
          </p>
          <ul className="mx-auto mt-6 max-w-sm space-y-3 text-left">
            {[
              "How many days was I away from Home?",
              "Where did I actually live my hours?",
              "How far did I travel, and how?",
              "Which countries has my map touched?",
            ].map((q) => (
              <li
                key={q}
                className="flex items-center gap-3 rounded-card border border-border bg-card px-4 py-3 text-sm"
              >
                <MapPin size={15} aria-hidden className="shrink-0 text-primary" />
                {q}
              </li>
            ))}
          </ul>
          <Link
            to="/import"
            className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:opacity-90"
          >
            Choose timeline file
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
    <div className="mx-auto min-w-0 max-w-4xl space-y-8 overflow-y-auto p-4 pb-16 sm:p-6 sm:pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The patterns hidden in your history.
          </p>
        </div>
        {/* Year or All time scope (#insights-scope). */}
        <label className="flex items-center gap-2 text-sm font-medium">
          Scope
          <select
            aria-label="Insights scope"
            className="h-11 rounded-md border border-border bg-background px-3 text-[15px]"
            value={selectedYear ?? ""}
            onChange={(e) =>
              setYear(e.target.value === "" ? null : Number(e.target.value))
            }
          >
            <option value="">All time</option>
            {[...years].reverse().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </header>

      {/* Editorial summary: sentences first. */}
      {narrative.length > 0 && (
        <section
          aria-label="Your year in brief"
          className="rounded-card border border-primary/25 bg-accent/50 p-6"
        >
          {narrative.map((line, index) => (
            <p
              key={index}
              className={
                index === 0
                  ? "font-display text-xl leading-snug sm:text-2xl"
                  : "mt-2 text-[15px] text-muted-foreground"
              }
            >
              {line}
            </p>
          ))}
        </section>
      )}

      {!home && (
        <section className="rounded-card border border-border bg-card p-5">
          <p className="flex items-center gap-2 font-medium">
            <Home size={16} aria-hidden className="text-primary" /> No Home declared
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Days-away stats need exactly one Home — nksha never guesses it.
          </p>
          {places.length > 0 && <ChooseHomeInline places={places} />}
        </section>
      )}

      {/* Hero metric pair. */}
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-4">
        <div className="rounded-card bg-card p-5 shadow-low">
          <h2 className="text-sm font-medium">Days away from Home</h2>
          <p className="mt-2 text-4xl font-semibold tabular">
            {home ? daysAway : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {home
              ? `Calendar days spent away from ${home.name}`
              : "Declare a Home to unlock this number"}
          </p>
        </div>
        <div className="rounded-card bg-card p-5 shadow-low">
          <h2 className="text-sm font-medium">Total distance</h2>
          <p className="mt-2 text-4xl font-semibold tabular">
            {modeDistances.length > 0
              ? formatDistance(
                  modeDistances.reduce((sum, m) => sum + m.distanceMeters, 0),
                )
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            From activity segments in your timeline
          </p>
        </div>
      </section>

      {/* Time pattern: month strip with full labels and legend. */}
      <section className="rounded-card bg-card p-5 shadow-low">
        <h2 className="section-title">{selectedYear} month by month</h2>
        <ol className="mt-4 grid grid-cols-12 gap-1.5">
          {density.map((count, index) => {
            const monthKey = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
            const intensity = count / maxDensity;
            return (
              <li key={monthKey}>
                <button
                  type="button"
                  title={`${MONTHS[index]} ${selectedYear}: ${count} ${count === 1 ? "day" : "days"} away`}
                  aria-label={`Focus ${MONTHS[index]} ${selectedYear}: ${count} ${
                    count === 1 ? "day" : "days"
                  } away`}
                  disabled={count === 0}
                  onClick={() => navigate(`/?month=${monthKey}`)}
                  className={cn(
                    "flex h-14 w-full flex-col items-end justify-end rounded-lg border p-1 transition-colors",
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
                  <span
                    className={cn(
                      "text-[11px] leading-none",
                      count > 0 && intensity > 0.45
                        ? "text-on-light-strong"
                        : "text-muted-foreground",
                    )}
                    style={count > 0 && intensity > 0.45 ? { color: "var(--on-brand)" } : undefined}
                  >
                    {MONTHS[index].slice(0, 1)}
                  </span>
                  <span className="sr-only">
                    {MONTHS[index]}: {count} {count === 1 ? "day" : "days"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Cells shade by visited days — darker means more days. Select a month
          to focus it on the Atlas.
        </p>
      </section>

      {/* Top places ranking: horizontal bars. */}
      <section className="rounded-card bg-card p-5 shadow-low">
        <h2 className="section-title">Top places</h2>
        {top.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No dwell data yet.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {top.map((entry, index) => {
              const maxDwell = Math.max(...top.map((t) => t.totalDwellMs));
              const widthPct = Math.max(6, Math.round((entry.totalDwellMs / maxDwell) * 100));
              return (
                <li key={entry.place.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">
                      <span aria-hidden className="mr-2 text-muted-foreground tabular">{index + 1}.</span>
                      {entry.place.name || "Unnamed place"}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular">
                      {formatDuration(entry.totalDwellMs)} ·{" "}
                      {entry.visitCount} {entry.visitCount === 1 ? "visit" : "visits"}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${entry.place.name}: ${formatDuration(entry.totalDwellMs)} total`}
                    className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Movement modes. */}
      <section className="rounded-card bg-card p-5 shadow-low">
        <h2 className="section-title">Distance by movement</h2>
        {modeDistances.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No travel distances yet — they come from activity segments in your
            timeline import.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {modeDistances.map((entry) => {
              const Icon = MODE_ICONS[entry.mode];
              const maxDist = Math.max(...modeDistances.map((m) => m.distanceMeters));
              const widthPct = Math.max(6, Math.round((entry.distanceMeters / maxDist) * 100));
              return (
                <li key={entry.mode} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 truncate font-medium">
                      <Icon size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                      {MODE_LABELS[entry.mode]}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular">
                      {formatDistance(entry.distanceMeters)}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${MODE_LABELS[entry.mode]}: ${formatDistance(entry.distanceMeters)}`}
                    className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Countries and farthest place. */}
      <CountriesCard
        codes={countryCodes}
        names={names}
        manual={manualCountries}
        status={countryStatus}
      />

      <section className="rounded-card bg-card p-5 shadow-low">
        <h2 className="section-title">Farthest place from Home</h2>
        {farthest ? (
          <p className="mt-2 text-[15px]" data-testid="farthest-place">
            <Link
              to="/"
              className="font-semibold underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {farthest.place.name || "Unnamed place"}
            </Link>{" "}
            <span className="tabular text-muted-foreground">
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
    </div>
  );
}

/** Inline searchable Home picker (#choose-home) for Insights. */
function ChooseHomeInline({ places }: { places: Place[] }) {
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="insights-choose-home"
        className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Search size={15} aria-hidden /> Choose Home here
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2" data-testid="choose-home">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your places…"
        aria-label="Search places to choose Home"
        className="h-11 w-full rounded-md border border-border bg-background px-3 text-[15px]"
      />
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No places match “{query}”.</p>
      ) : (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {matches.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => void setHomePlace(place.id)}
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
    <section className="rounded-card bg-card p-5 shadow-low">
      <h2 className="section-title">Countries visited</h2>
      {status === "error" && (
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          Country detection failed — manual entries still work.
        </p>
      )}
      {codes.length === 0 && status !== "error" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "working"
            ? "Matching your places against country borders…"
            : "No countries detected yet."}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground tabular">
          {codes.length} {codes.length === 1 ? "country" : "countries"} ·{" "}
          {manualSet.size} added by you
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {codes.map((code) => {
          const isManual = manualSet.has(code);
          return (
            <li
              key={code}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
            >
              <span>{names[code] ?? code}</span>
              <span className="text-muted-foreground">{code}</span>
              {isManual && (
                <button
                  type="button"
                  aria-label={`Remove ${names[code] ?? code}`}
                  className="flex size-5 items-center justify-center rounded-full hover:bg-muted"
                  onClick={() => void removeManualCountry(code)}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={(e) => void addManual(e)} className="mt-3 flex items-start gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Add a country
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="ISO code, e.g. CHE"
            aria-invalid={error !== null}
            maxLength={3}
            className="h-10 w-40 rounded-md border border-border bg-background px-3 text-[15px] aria-invalid:border-destructive sm:w-56"
          />
        </label>
        <button
          type="submit"
          className="mt-auto flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          <Plus size={14} aria-hidden /> Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Detected from your places; layovers and disputed borders can be added
        by hand and are never revoked by imports.
      </p>
    </section>
  );
}
