import { useLiveQuery } from "dexie-react-hooks";
import { useRef } from "react";
import {
  getBasemapStyle,
  getCustomStyleUrl,
  setBasemapStyle,
  setCustomStyleUrl,
} from "@/db/repo";
import type { BasemapStyle } from "@/db/schema";

const STYLE_OPTIONS: { value: BasemapStyle; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export default function SettingsView() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  const storedUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");
  const urlInputRef = useRef<HTMLInputElement>(null);

  const commitUrl = () => {
    const value = urlInputRef.current?.value ?? "";
    void setCustomStyleUrl(value.trim());
  };

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

      <p className="text-xs text-muted-foreground">
        Everything in nksha runs in your browser and your timeline data never
        leaves this device. The one exception you will see in your network tab:
        map tiles, served by Carto (or by a style URL you configure yourself).
      </p>
    </div>
  );
}

