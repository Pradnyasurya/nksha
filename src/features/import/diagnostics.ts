import { dayKey, dayKeyToDate } from "@/lib/days";
import type { ImportReport } from "@/features/import/useImporter";
import type { SkipReason } from "@/features/import/parse";

/**
 * Structure-and-counts only: no place names, coordinates, or timestamps
 * leave the device beyond what the user chooses to share (#import-ceremony).
 */
export function buildDiagnostic(
  fileName: string,
  report: ImportReport,
): string {
  return JSON.stringify(
    {
      kind: "nksha-import-diagnostics",
      version: 1,
      fileName,
      generatedAt: new Date().toISOString(),
      placesFound: report.placesFound,
      visitsCreated: report.visitsCreated,
      visitsSkippedAsDuplicates: report.visitsSkipped,
      movementsCreated: report.movementsCreated,
      segmentsSkipped: report.skippedSegments,
      skippedByReason: report.skippedByReason,
      tripsInferred: report.tripsInferred,
      firstVisitDay:
        report.firstVisitTimeMs === null
          ? null
          : dayKeyToDate(dayKey(report.firstVisitTimeMs)).toISOString().slice(0, 10),
      lastVisitDay:
        report.lastVisitTimeMs === null
          ? null
          : dayKeyToDate(dayKey(report.lastVisitTimeMs)).toISOString().slice(0, 10),
    },
    null,
    2,
  );
}

/** Human phrasing for parser skip reasons on the report screen. */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  "missing-timestamp": "Entries without a readable time",
  "missing-coordinates": "Entries without usable coordinates",
  "missing-location": "Place entries missing their location block",
  "no-usable-activity": "Travel entries with no activity payload",
  "unknown-activity-type": "Travel with an unrecognised mode",
};
