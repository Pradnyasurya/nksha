import { useEffect, useRef, useState } from "react";
import {
  TimelineParseError,
  type ParsedTimeline,
  type ParseErrorCode,
  type SkipReason,
} from "@/features/import/parse";
import { getDb } from "@/db/db";
import { insertImportBundle, runTripInference } from "@/db/repo";
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from "@/workers/import.worker";

/** Human-readable parsing ceremony stages (#import-ceremony). */
export type ImportStage =
  | "reading"
  | "parsing"
  | "grouping"
  | "building";

const STAGE_LABELS: Record<ImportStage, string> = {
  reading: "Reading your file",
  parsing: "Finding visits",
  grouping: "Grouping places",
  building: "Building your map",
};

export function stageLabel(stage: ImportStage): string {
  return STAGE_LABELS[stage];
}

export type ImportState =
  | { phase: "idle" }
  | { phase: "working"; fileName: string; stage: ImportStage }
  | {
      phase: "error";
      fileName: string;
      message: string;
      code?: ParseErrorCode | "storage-quota";
    }
  | { phase: "done"; fileName: string; report: ImportReport };

export interface ImportReport {
  placesFound: number;
  visitsCreated: number;
  visitsSkipped: number;
  /** Visits the parsed file contained — created or already present. */
  visitsInFile: number;
  movementsCreated: number;
  firstVisitTimeMs: number | null;
  lastVisitTimeMs: number | null;
  tripsInferred: number;
  skippedSegments: number;
  skippedByReason: Partial<Record<SkipReason, number>>;
  /**
   * Existing visits whose timestamps fall inside the imported range —
   * a re-import or partial merge, worth telling the user about.
   */
  overlappingExisting: number;
}

class ImportStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportStorageError";
  }
}

/**
 * Runs parsing inside a Web Worker so large exports never block the UI
 * (ADR-0001), then persists results on the main thread via Dexie.
 */
export function useImporter() {
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<
    number,
    {
      resolve: (value: ParsedTimeline) => void;
      reject: (reason: Error) => void;
    }
  > | null>(new Map());
  const nextIdRef = useRef(1);

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pending?.clear();
    };
  }, []);

  function ensureWorker(): Worker {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(
      new URL("../../workers/import.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      const pending = pendingRef.current?.get(event.data.id);
      if (!pending) return;
      pendingRef.current!.delete(event.data.id);
      if (event.data.ok) pending.resolve(event.data.result);
      else {
        const failure = new TimelineParseError(
          event.data.code ?? "unsupported-format",
          event.data.error,
        );
        pending.reject(failure);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Import worker crashed");
      for (const pending of pendingRef.current?.values() ?? []) {
        pending.reject(error);
      }
      pendingRef.current?.clear();
    };
    workerRef.current = worker;
    return worker;
  }

  async function importFile(file: File): Promise<void> {
    setState({ phase: "working", fileName: file.name, stage: "reading" });
    try {
      const text = await file.text();

      setState({
        phase: "working",
        fileName: file.name,
        stage: "parsing",
      });
      const parsed = await new Promise<ParsedTimeline>((resolve, reject) => {
        const worker = ensureWorker();
        const id = nextIdRef.current++;
        pendingRef.current!.set(id, { resolve, reject });
        const request: ImportWorkerRequest = { id, text };
        worker.postMessage(request);
      });

      setState({ phase: "working", fileName: file.name, stage: "grouping" });
      const overlappingExisting = await countOverlappingVisits(parsed);
      await assertBrowserStorageCanHold(file.size);

      setState({ phase: "working", fileName: file.name, stage: "building" });
      const outcome = await insertParsed(parsed, file.name, overlappingExisting);
      setState({ phase: "done", fileName: file.name, report: outcome });
    } catch (err) {
      setState({
        phase: "error",
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
        code:
          err instanceof ImportStorageError
            ? "storage-quota"
            : err instanceof TimelineParseError
              ? err.code
              : undefined,
      });
    }
  }

  return { state, importFile };
}

/**
 * Best-effort quota probe before a potentially large write (#error-handling).
 * Browsers without the Storage Manager API are allowed through.
 */
async function assertBrowserStorageCanHold(fileSize: number): Promise<void> {
  try {
    const estimate = navigator.storage?.estimate?.();
    if (!estimate) return;
    const { quota = 0, usage = 0 } = await estimate;
    if (!quota) return;
    // Parsed visits + movements comfortably exceed the raw JSON size.
    const neededBytes = fileSize * 2 + 20 * 1024 * 1024;
    if (usage + neededBytes > quota * 0.95) {
      throw new ImportStorageError(
        "This browser is nearly out of local storage, which nksha needs to hold your timeline. Free up site data for other apps (or export an archive in Settings) and try again.",
      );
    }
  } catch (err) {
    if (err instanceof ImportStorageError) throw err;
    // Estimate unavailable/failing is not fatal — the insert will surface
    // real quota errors itself.
  }
}

function toStorageMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "QuotaExceededError") {
    return "This browser ran out of local storage while saving your import. Nothing was lost — free up space and import again.";
  }
  if (name === "InvalidStateError" || name === "DatabaseClosedError") {
    return "The local database refused the write (it may be open in another tab or blocked by private browsing). Close other nksha tabs and retry.";
  }
  return err instanceof Error ? err.message : String(err);
}

async function countOverlappingVisits(parsed: ParsedTimeline): Promise<number> {
  let min = Infinity;
  let max = -Infinity;
  for (const visit of parsed.visits) {
    if (visit.startTimeMs < min) min = visit.startTimeMs;
    if (visit.startTimeMs > max) max = visit.startTimeMs;
  }
  if (!Number.isFinite(min)) return 0;
  return getDb().visits.where("startTimeMs").between(min, max, true, true).count();
}

async function insertParsed(
  parsed: ParsedTimeline,
  fileName: string,
  overlappingExisting: number,
): Promise<ImportReport> {
  const importId =
    globalThis.crypto.randomUUID?.() ?? `imp-${Date.now()}-${Math.random()}`;
  const now = Date.now();
  let outcome;
  let tripsInferred;
  try {
    outcome = await insertImportBundle({
      importRecord: {
        id: importId,
        fileName,
        importedAt: now,
        placesFound: parsed.places.length,
      },
      places: parsed.places.map((p) => ({
        ...p,
        isHome: 0 as const,
        createdAt: now,
      })),
      visits: parsed.visits.map((v) => ({
        ...v,
        importId,
        createdAt: now,
      })),
      movements: parsed.movements.map((m) => ({
        ...m,
        importId,
        createdAt: now,
      })),
    });
    tripsInferred = await runTripInference();
  } catch (err) {
    throw new ImportStorageError(toStorageMessage(err));
  }
  return {
    placesFound: parsed.places.length,
    visitsCreated: outcome.visitsCreated,
    visitsSkipped: outcome.visitsSkipped,
    movementsCreated: outcome.movementsCreated,
    // Report the FILE's span, not just the created subset — on a duplicate
    // import nothing is created but the range must still render.
    visitsInFile: parsed.visits.length,
    firstVisitTimeMs: parsedFileRange(parsed).firstMs,
    lastVisitTimeMs: parsedFileRange(parsed).lastMs,
    tripsInferred,
    skippedSegments: parsed.skippedSegments,
    skippedByReason: parsed.skippedByReason,
    overlappingExisting,
  };
}

/** The imported file's own visit-date span (created or already stored). */
function parsedFileRange(parsed: ParsedTimeline): {
  firstMs: number | null;
  lastMs: number | null;
} {
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  for (const visit of parsed.visits) {
    if (firstMs === null || visit.startTimeMs < firstMs) {
      firstMs = visit.startTimeMs;
    }
    const end = visit.endTimeMs ?? visit.startTimeMs;
    if (lastMs === null || end > lastMs) lastMs = end;
  }
  return { firstMs, lastMs };
}
