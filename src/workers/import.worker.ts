import {
  TimelineParseError,
  parseTimeline,
  type ParseErrorCode,
} from "@/features/import/parse";

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
  /** Machine-readable failure class so the UI can offer targeted advice. */
  code?: ParseErrorCode;
}

export type ImportWorkerResponse = ImportWorkerSuccess | ImportWorkerFailure;

function toErrorCode(err: unknown): ParseErrorCode | undefined {
  return err instanceof TimelineParseError ? err.code : undefined;
}

self.onmessage = (event: MessageEvent<ImportWorkerRequest>) => {
  const { id, text } = event.data;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TimelineParseError(
        "malformed-json",
        "This file is not valid JSON, so it cannot be read. Make sure you picked the Timeline file itself (not a .zip or .html export) and that the download finished completely.",
      );
    }
    const result = parseTimeline(parsed);
    const response: ImportWorkerSuccess = { id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: ImportWorkerFailure = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: toErrorCode(err),
    };
    self.postMessage(response);
  }
};
