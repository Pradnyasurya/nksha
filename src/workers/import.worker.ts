import { parseTimeline } from "@/features/import/parse";

export interface ImportWorkerRequest {
  id: number;
  text: string;
}

export interface ImportWorkerSuccess {
  id: number;
  ok: true;
  result: ReturnType<typeof parseTimeline>;
}

export interface ImportWorkerFailure {
  id: number;
  ok: false;
  error: string;
}

export type ImportWorkerResponse = ImportWorkerSuccess | ImportWorkerFailure;

self.onmessage = (event: MessageEvent<ImportWorkerRequest>) => {
  const { id, text } = event.data;
  try {
    const result = parseTimeline(JSON.parse(text));
    const response: ImportWorkerSuccess = { id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: ImportWorkerFailure = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
