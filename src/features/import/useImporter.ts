import { useEffect, useRef, useState } from "react";
import type { ParsedTimeline } from "@/features/import/parse";
import { insertImportBundle, runTripInference } from "@/db/repo";
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from "@/workers/import.worker";

type ImportState =
  | { phase: "idle" }
  | { phase: "working"; fileName: string }
  | { phase: "error"; fileName: string; message: string }
  | {
      phase: "done";
      fileName: string;
      report: ImportReport;
    };

export interface ImportReport {
  placesFound: number;
  visitsCreated: number;
  visitsSkipped: number;
  firstVisitTimeMs: number | null;
  lastVisitTimeMs: number | null;
  tripsInferred: number;
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
      else pending.reject(new Error(event.data.error));
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
    setState({ phase: "working", fileName: file.name });
    try {
      const text = await file.text();
      const parsed = await new Promise<ParsedTimeline>((resolve, reject) => {
        const worker = ensureWorker();
        const id = nextIdRef.current++;
        pendingRef.current!.set(id, { resolve, reject });
        const request: ImportWorkerRequest = { id, text };
        worker.postMessage(request);
      });

      const outcome = await insertParsed(parsed, file.name);
      setState({ phase: "done", fileName: file.name, report: outcome });
    } catch (err) {
      setState({
        phase: "error",
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { state, importFile };
}

async function insertParsed(
  parsed: ParsedTimeline,
  fileName: string,
): Promise<ImportReport> {
  const importId =
    globalThis.crypto.randomUUID?.() ?? `imp-${Date.now()}-${Math.random()}`;
  const now = Date.now();
  const outcome = await insertImportBundle({
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
  });
  const tripsInferred = await runTripInference();
  return {
    placesFound: parsed.places.length,
    visitsCreated: outcome.visitsCreated,
    visitsSkipped: outcome.visitsSkipped,
    firstVisitTimeMs: outcome.firstVisitTimeMs,
    lastVisitTimeMs: outcome.lastVisitTimeMs,
    tripsInferred,
  };
}
