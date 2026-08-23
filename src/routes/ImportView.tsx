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
  ShieldCheck,
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
    <div className="mx-auto min-w-0 max-w-2xl space-y-6 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="page-title">Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One file in, one private atlas out. Parsing happens entirely in your
          browser — the file never leaves this device.
        </p>
      </header>

      {/* Step 1: choose file. The dropzone is a real <button>: focusable,
          Enter/Space activatable. */}
      <section
        data-testid="dropzone"
        className={cn(
          "rounded-card border-2 border-dashed transition-all duration-150",
          dragging
            ? "border-primary bg-accent shadow-low"
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
              <p className="text-[15px] font-medium" aria-live="polite">
                {stageLabel(state.stage)}…
              </p>
              <p className="max-w-xs truncate text-sm text-muted-foreground">
                {state.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                Keep this tab open — large files can take a minute or two.
              </p>
            </>
          ) : (
            <>
              <span className="text-[15px] font-medium">
                Drop your Google Maps Timeline export here
              </span>
              <span className="text-sm text-muted-foreground">
                or{" "}
                <span className="font-medium text-primary underline underline-offset-2">
                  choose a file
                </span>{" "}
                — .json
              </span>
            </>
          )}
        </button>
      </section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck size={15} aria-hidden className="text-positive" />
        Your file is parsed here and stored in this browser — nothing is
        uploaded.
      </p>

      {state.phase === "error" && (
        <section
          role="alert"
          aria-live="assertive"
          data-testid="import-error"
          className="rounded-card border border-destructive/40 bg-card p-5"
        >
          <p className="flex items-center gap-2 text-[15px] font-medium">
            <AlertTriangle size={15} aria-hidden className="text-destructive" />
            Could not import {state.fileName}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {state.message} Your existing data was not changed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={pickFile}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <RefreshCw size={14} aria-hidden /> Try another file
            </button>
            <details className="min-h-11">
              <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
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

      {/* Step 3: the outcome leads with what changed. */}
      {report && (
        <section
          data-testid="import-report"
          aria-live="polite"
          className="rounded-card border border-border bg-card p-5"
        >
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <CheckCircle2 size={18} aria-hidden className="text-positive" />
            {state.phase === "done" ? `${state.fileName} imported` : ""}
          </p>

          {report.visitsInFile === 0 && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl bg-accent p-3 text-sm"
            >
              <AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
              No visits came out of this file. It may contain only travel
              entries, or history too recent for Timeline to have processed.
              Your atlas will stay empty until an import produces visits.
            </p>
          )}

          {report.visitsInFile > 0 && report.visitsCreated === 0 && (
            <p
              role="status"
              data-testid="duplicate-import-note"
              className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"
            >
              <CheckCircle2 size={15} aria-hidden className="mt-0.5 shrink-0 text-positive" />
              All {report.visitsSkipped || report.visitsInFile} visits were
              already in your atlas. Nothing was changed.
            </p>
          )}

          {report.overlappingExisting > 0 && (
            <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              Merged with existing data: {report.overlappingExisting} visit
              {report.overlappingExisting === 1 ? "" : "s"} already covered this
              date range. Duplicates were skipped — nothing was overwritten or
              deleted.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Date range</dt>
              <dd className="tabular">
                {formatDay(report.firstVisitTimeMs)} –{" "}
                {formatDay(report.lastVisitTimeMs)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Visits added</dt>
              <dd className="tabular">{report.visitsCreated}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Places found</dt>
              <dd className="tabular">{report.placesFound}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Movements</dt>
              <dd className="tabular">{report.movementsCreated}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Stories suggested
              </dt>
              <dd className="tabular">{report.tripsInferred}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Skipped entries</dt>
              <dd className="tabular">
                {report.skippedSegments}
                {report.visitsSkipped > 0 &&
                  ` (+${report.visitsSkipped} duplicate${report.visitsSkipped === 1 ? "" : "s"})`}
              </dd>
            </div>
          </dl>

          {report.skippedSegments > 0 && (
            <details className="mt-3 text-sm text-muted-foreground">
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

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/"
              className="flex min-h-12 items-center rounded-xl bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground hover:opacity-90"
            >
              Open my atlas
            </Link>
            <Link
              to="/dashboard"
              className="flex min-h-12 items-center rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-muted"
            >
              Preview insights
            </Link>
            <button
              type="button"
              onClick={downloadDiagnostics}
              className="flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-muted"
            >
              <Download size={14} aria-hidden /> Download import report
            </button>
          </div>
        </section>
      )}

      <details
        id="how-to-export"
        className="rounded-card border border-border bg-card p-5 text-sm"
      >
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
