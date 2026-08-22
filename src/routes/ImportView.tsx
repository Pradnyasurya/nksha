import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useImporter } from "@/features/import/useImporter";
import { dayKey, dayKeyToDate } from "@/lib/days";
import { cn } from "@/lib/cn";

function formatDay(ms: number | null): string {
  if (ms === null) return "—";
  return dayKeyToDate(dayKey(ms)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ImportView() {
  const { state, importFile } = useImporter();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Import</h1>

      <section
        data-testid="dropzone"
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-border",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void importFile(file);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium">
          Drop your Google Maps Timeline export here
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          or click to choose a file. Parsing happens entirely in your browser —
          the file never leaves this device.
        </p>
        {state.phase === "working" && (
          <p className="mt-4 text-sm text-primary" role="status">
            Parsing {state.fileName}…
          </p>
        )}
      </section>

      {state.phase === "error" && (
        <section
          role="alert"
          className="rounded-lg border border-destructive/40 bg-card p-4"
        >
          <p className="text-sm font-medium">Could not import {state.fileName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        </section>
      )}

      {state.phase === "done" && (
        <section
          data-testid="import-report"
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="text-sm font-medium">{state.fileName} imported</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Places found</dt>
            <dd>{state.report.placesFound}</dd>
            <dt className="text-muted-foreground">Visits created</dt>
            <dd>{state.report.visitsCreated}</dd>
            <dt className="text-muted-foreground">Visits skipped (duplicates)</dt>
            <dd>{state.report.visitsSkipped}</dd>
            <dt className="text-muted-foreground">Covered range</dt>
            <dd>
              {formatDay(state.report.firstVisitTimeMs)} –{" "}
              {formatDay(state.report.lastVisitTimeMs)}
            </dd>
          </dl>
          <div className="mt-4 flex gap-2">
            <Link to="/">
              <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
                View on map
              </button>
            </Link>
            <Link to="/dashboard">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                Open dashboard
              </button>
            </Link>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Exports come from Google Takeout (Maps → Timeline). nksha reads them
        read-only and stores everything locally.
      </p>
    </div>
  );
}
