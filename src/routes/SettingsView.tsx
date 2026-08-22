import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
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

const STYLE_OPTIONS: { value: BasemapStyle; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export default function SettingsView() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  const storedUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoreState, setRestoreState] = useState<
    | { phase: "idle" }
    | { phase: "working" }
    | { phase: "done"; outcome: RestoreOutcome }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const commitUrl = () => {
    const value = urlInputRef.current?.value ?? "";
    void setCustomStyleUrl(value.trim());
  };

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
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="rounded-lg border border-border bg-card p-4">
        <label
          htmlFor="basemap-style"
          className="block text-sm font-medium"
        >
          Basemap style
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Applied to the map and the rest of the app. Stored locally on this
          device.
        </p>
        <select
          id="basemap-style"
          className="mt-3 h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={style}
          onChange={(e) =>
            void setBasemapStyle(e.target.value as BasemapStyle)
          }
        >
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label
          htmlFor="custom-style-url"
          className="mt-4 block text-sm font-medium"
        >
          Custom MapLibre style URL
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          A MapLibre style JSON served over HTTP(S). When set, it replaces the
          built-in styles above; if it fails to load, nksha falls back to the
          default.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            key={storedUrl}
            ref={urlInputRef}
            id="custom-style-url"
            type="text"
            placeholder="Paste a MapLibre style JSON URL"
            className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm"
            defaultValue={storedUrl}
            onBlur={commitUrl}
          />
          <button
            type="button"
            className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
            onClick={commitUrl}
          >
            Save
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">My data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything lives only on this device, so an Archive file is your
          backup: places, visits, movements, trips, settings, and what you
          have dismissed. Restore merges by id — nothing is deleted.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:opacity-90"
            onClick={() => void exportArchive()}
          >
            <Download size={15} aria-hidden /> Export my data
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
            onClick={() => restoreInputRef.current?.click()}
          >
            <Upload size={15} aria-hidden /> Restore from Archive…
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
          <p role="status" className="mt-3 text-sm">
            Restored {restoreState.outcome.places} places,{" "}
            {restoreState.outcome.visits} visits,{" "}
            {restoreState.outcome.movements} movements,{" "}
            {restoreState.outcome.trips} trips.
          </p>
        )}
        {restoreState.phase === "error" && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {restoreState.message}
          </p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Everything in nksha runs in your browser and your timeline data never
        leaves this device. The one exception you will see in your network tab:
        map tiles, served by Carto (or by a style URL you configure yourself).
      </p>
    </div>
  );
}

