import { useLiveQuery } from "dexie-react-hooks";
import { getBasemapStyle, setBasemapStyle } from "@/db/repo";
import type { BasemapStyle } from "@/db/schema";

const STYLE_OPTIONS: { value: BasemapStyle; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export default function SettingsView() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");

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
      </section>

      <p className="text-xs text-muted-foreground">
        Everything in nksha runs in your browser. Your timeline data never
        leaves this device.
      </p>
    </div>
  );
}
