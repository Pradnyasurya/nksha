import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  HelpCircle,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  useImporter,
  stageLabel,
} from "@/features/import/useImporter";
import {
  buildDiagnostic,
  SKIP_REASON_LABELS,
} from "@/features/import/diagnostics";
import type { SkipReason } from "@/features/import/parse";
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

  const working = state.phase === "working";
  const report = state.phase === "done" ? state.report : null;

  function pickFile(): void {
    inputRef.current?.click();
  }

  function handleFile(file: File): void {
    void importFile(file);
  }

  function downloadDiagnostics(): void {
    if (state.phase !== "done") return;
    const blob = new Blob([buildDiagnostic(state.fileName, state.report)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nksha-import-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="mx-auto min-w-0 max-w-2xl space-y-5 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Import your timeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One file in, one private atlas out. Parsing happens entirely in your
          browser — the file never leaves this device.
        </p>
      </header>

      {/* The dropzone is a real <button>: focusable, Enter/Space activatable. */}
      <section
        data-testid="dropzone"
        className={cn(
          "rounded-xl border-2 border-dashed transition-all duration-150",
          dragging
            ? "scale-[1.01] border-primary bg-accent shadow-md"
            : "border-border",
          working && "opacity-70",
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
          if (file) handleFile(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Choose your Google Maps Timeline export file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={working}
          onClick={pickFile}
          className="flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-[inherit] p-6 text-center hover:bg-muted/50 disabled:pointer-events-none"
        >
          {state.phase === "working" ? (
            <Loader2 size={28} aria-hidden className="animate-spin text-primary" />
          ) : dragging ? (
            <Upload size={28} aria-hidden className="text-primary" />
          ) : (
            <FileJson size={28} aria-hidden className="text-muted-foreground" />
          )}

          {state.phase === "working" ? (
            <>
              <p className="text-sm font-medium" aria-live="polite">
                {stageLabel(state.stage)}…
              </p>
              <p className="max-w-xs truncate text-xs text-muted-foreground">
                {state.fileName}
              </p>
            </>
          ) : (
            <>
              <span className="text-sm font-medium">
                Drop your Google Maps Timeline export here
              </span>
              <span className="text-sm text-muted-foreground">
                or{" "}
                <span className="font-medium text-primary underline underline-offset-2">
                  choose a file
                </span>{" "}
                — .json up to roughly a few hundred MB
              </span>
            </>
          )}
        </button>
      </section>

      {state.phase === "error" && (
        <section
          role="alert"
          aria-live="assertive"
          data-testid="import-error"
          className="rounded-lg border border-destructive/40 bg-card p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle size={15} aria-hidden className="text-destructive" />
            Could not import {state.fileName}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{state.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={pickFile}
              className="flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <RefreshCw size={14} aria-hidden /> Try another file
            </button>
            <details className="min-h-11">
              <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                <HelpCircle size={14} aria-hidden /> What file should I use?
              </summary>
              <p className="mt-2 px-1 text-sm text-muted-foreground">
                Request “Maps (your places)” at takeout.google.com, unzip the
                archive, and pick the Timeline JSON inside — usually named{" "}
                <code className="rounded bg-muted px-1">
                  Location History (Timeline).json
                </code>
                . Files named plain <em>Location History.json</em> are an older,
                unsupported format.
              </p>
            </details>
          </div>
        </section>
      )}

      {report && (
        <section
          data-testid="import-report"
          aria-live="polite"
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 size={17} aria-hidden className="text-primary" />
            {state.phase === "done" ? `${state.fileName} imported` : ""}
          </p>

          {report.visitsCreated === 0 && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md bg-accent p-3 text-sm"
            >
              <AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
              No visits came out of this file. It may contain only travel
              entries, or history too recent for Timeline to have processed.
              Your map will stay empty until an import produces visits.
            </p>
          )}

          {report.overlappingExisting > 0 && (
            <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Merged with existing data: {report.overlappingExisting} visit
              {report.overlappingExisting === 1 ? "" : "s"} already covered this
              date range. Duplicates were skipped — nothing was overwritten or
              deleted.
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Date range</dt>
              <dd className="tabular-nums">
                {formatDay(report.firstVisitTimeMs)} –{" "}
                {formatDay(report.lastVisitTimeMs)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Visits created</dt>
              <dd className="tabular-nums">{report.visitsCreated}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Places found</dt>
              <dd className="tabular-nums">{report.placesFound}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Movements</dt>
              <dd className="tabular-nums">{report.movementsCreated}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Trips suggested
              </dt>
              <dd className="tabular-nums">{report.tripsInferred}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Skipped entries</dt>
              <dd className="tabular-nums">
                {report.skippedSegments}
                {report.visitsSkipped > 0 &&
                  ` (+${report.visitsSkipped} duplicate${report.visitsSkipped === 1 ? "" : "s"})`}
              </dd>
            </div>
          </dl>

          {report.skippedSegments > 0 && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Why were {report.skippedSegments} segment
                {report.skippedSegments === 1 ? "" : "s"} skipped?
              </summary>
              <ul className="mt-1.5 space-y-0.5 pl-4">
                {(Object.entries(report.skippedByReason) as [SkipReason, number][]).map(
                  ([reason, n]) => (
                    <li key={reason}>
                      {SKIP_REASON_LABELS[reason]}: {n}
                    </li>
                  ),
                )}
              </ul>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/">
              <button
                type="button"
                className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                View your map
              </button>
            </Link>
            <Link to="/dashboard">
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Open insights
              </button>
            </Link>
            <button
              type="button"
              onClick={downloadDiagnostics}
              className="flex min-h-11 items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              <Download size={14} aria-hidden /> Save local report
            </button>
          </div>
        </section>
      )}

      <details className="rounded-lg border border-border bg-card p-4 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium">
          <HelpCircle size={15} aria-hidden /> Which export works?
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            At takeout.google.com request only <strong>Maps (your places)</strong>.
          </li>
          <li>Unzip the archive when it arrives.</li>
          <li>
            Choose the Timeline JSON — typically{" "}
            <code className="rounded bg-muted px-1">
              Location History (Timeline).json
            </code>{" "}
            inside the <em>Timeline</em> folder.
          </li>
          <li>
            nksha reads the file once, locally; nothing is uploaded anywhere.
          </li>
        </ul>
      </details>
    </div>
  );
}
