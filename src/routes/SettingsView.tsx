import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import {
  getBasemapStyle,
  getCustomStyleUrl,
  setBasemapStyle,
  setCustomStyleUrl,
} from "@/db/repo";
import type { BasemapStyle } from "@/db/schema";
import {
  buildArchive,
  parseArchive,
  restoreArchive,
  serializeArchive,
  type RestoreOutcome,
} from "@/features/archive/archive";
import { isValidStyleUrl } from "@/features/map/mapStyles";
import { cn } from "@/lib/cn";

const STYLE_OPTIONS: { value: BasemapStyle; label: string; hint: string }[] = [
  { value: "dark", label: "Midnight atlas", hint: "Deep blue water and ink roads" },
  { value: "light", label: "Warm paper", hint: "Parchment tones, quiet detail" },
];

export default function SettingsView() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  const storedUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoreState, setRestoreState] = useState<
    | { phase: "idle" }
    | { phase: "working" }
    | { phase: "done"; outcome: RestoreOutcome }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  // Appearance form state: edits stay local until Save (#settings-confirm),
  // so a stray change never silently rewrites the basemap.
  const [draftStyle, setDraftStyle] = useState<BasemapStyle | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const effectiveStyle = draftStyle ?? style;
  const effectiveUrl = draftUrl ?? storedUrl;
  const dirty =
    (draftStyle !== null && draftStyle !== style) ||
    (draftUrl !== null && draftUrl !== storedUrl);

  // A custom URL must at least look like a style URL before saving — warn
  // inline instead of letting the map fail later (#settings-confirm).
  const urlWarning =
    effectiveUrl.trim() !== "" && !isValidStyleUrl(effectiveUrl.trim())
      ? "This does not look like a map style URL — it must be http(s) and point at a style JSON."
      : null;

  const saveTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
  }, []);

  function save(): void {
    if (!dirty || urlWarning) return;
    const urlToSave = draftUrl !== null ? draftUrl.trim() : storedUrl;
    void setBasemapStyle(effectiveStyle).then(() =>
      setCustomStyleUrl(urlToSave),
    );
    setDraftStyle(null);
    setDraftUrl(null);
    setSavedAt(Date.now());
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSavedAt(null), 4000);
  }

  /** Discards the unsaved draft only — stored settings are untouched. */
  function discard(): void {
    setDraftStyle(null);
    setDraftUrl(null);
  }

  async function exportArchive(): Promise<void> {
    const json = serializeArchive(await buildArchive());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nksha-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  async function restoreFromFile(file: File): Promise<void> {
    setRestoreState({ phase: "working" });
    try {
      const archive = parseArchive(JSON.parse(await file.text()));
      const outcome = await restoreArchive(archive);
      setRestoreState({ phase: "done", outcome });
    } catch (err) {
      setRestoreState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-2xl space-y-8 overflow-y-auto p-4 pb-16 sm:p-6 sm:pb-16">
      <header>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Appearance, your data, and how nksha protects it.
        </p>
      </header>

      {/* Appearance ------------------------------------------------------- */}
      <section className="rounded-card border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Appearance</h2>
          {savedAt !== null && (
            <p role="status" data-testid="settings-saved" className="text-sm text-positive">
              Settings saved
            </p>
          )}
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Map and app theme</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {STYLE_OPTIONS.map((opt) => {
              const selected = effectiveStyle === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDraftStyle(opt.value)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-primary ring-2 ring-ring"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {/* Preview tile. */}
                  <span
                    aria-hidden
                    className={cn(
                      "mb-2 block h-14 w-full rounded-lg border border-border",
                      opt.value === "dark"
                        ? "bg-gradient-to-br from-[#16233f] via-[#1c2c50] to-[#0f1830]"
                        : "bg-gradient-to-br from-[#f2ead9] via-[#e9dfc8] to-[#dcd0b4]",
                    )}
                  />
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Advanced: custom style URL is an expert control (#settings). */}
        <details
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          className="mt-4 border-t border-border pt-3 text-sm"
        >
          <summary className="cursor-pointer font-medium text-muted-foreground">
            Advanced · custom map style URL
          </summary>
          <p className="mt-2 text-muted-foreground">
            A style JSON served over HTTP(S). When set, it replaces the built-in
            styles above; if it fails to load, nksha falls back to the default.
            Note: a custom style can contact its host — that traffic leaves this
            device, unlike everything else in nksha.
          </p>
          <input
            type="text"
            value={effectiveUrl}
            placeholder="Paste a style JSON URL"
            aria-label="Custom map style URL"
            aria-invalid={urlWarning !== null}
            className="mt-3 h-11 w-full rounded-md border border-border bg-background px-3 text-[15px] aria-invalid:border-destructive"
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          {urlWarning && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {urlWarning}
            </p>
          )}
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="settings-save"
            disabled={!dirty || urlWarning !== null}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            onClick={save}
          >
            Save changes
          </button>
          <button
            type="button"
            disabled={!dirty}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            onClick={discard}
          >
            <RotateCcw size={14} aria-hidden /> Discard changes
          </button>
          {dirty && savedAt === null && (
            <span className="text-sm text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </section>

      {/* My data ---------------------------------------------------------- */}
      <section className="rounded-card border border-border bg-card p-5">
        <h2 className="section-title">My data</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Everything lives only in this browser — browser storage can be
          cleared by your browser or operating system, so an Archive backup file
          is your safety net: places, visits, movements, trips, settings, and
          what you have dismissed.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="download-archive"
            className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={() => void exportArchive()}
          >
            <Download size={15} aria-hidden /> Download Archive backup
          </button>
          <button
            type="button"
            data-testid="restore-archive"
            className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => restoreInputRef.current?.click()}
          >
            <Upload size={15} aria-hidden /> Restore Archive
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void restoreFromFile(file);
            }}
          />
        </div>

        {restoreState.phase === "working" && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Restoring…
          </p>
        )}
        {restoreState.phase === "done" && (
          <div role="status" data-testid="restore-result" className="mt-3 rounded-xl bg-muted p-3 text-sm">
            <p>
              Restored {restoreState.outcome.places} places,{" "}
              {restoreState.outcome.visits} visits,{" "}
              {restoreState.outcome.movements} movements,{" "}
              {restoreState.outcome.trips} trips. Nothing was deleted — restore
              merges by id.
            </p>
            <a href="/" className="mt-1 inline-block font-medium text-primary underline underline-offset-2">
              Open my atlas
            </a>
          </div>
        )}
        {restoreState.phase === "error" && (
          <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {restoreState.message} Your current data was not changed.
          </p>
        )}
      </section>

      {/* Privacy ---------------------------------------------------------- */}
      <section className="rounded-card border border-border bg-card p-5">
        <h2 className="section-title">Privacy</h2>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          <li>Timeline records stay in this browser.</li>
          <li>nksha has no account and no telemetry.</li>
          <li>The basemap tiles come from the configured tile provider.</li>
          <li>A custom map style may contact its host.</li>
        </ul>
      </section>
    </div>
  );
}
