import { getDb } from "@/db/db";
import type {
  DismissedTripRange,
  ImportRecord,
  Movement,
  Place,
  Trip,
  Visit,
} from "@/db/schema";
import {
  SETTING_DISMISSED_TRIP_RANGES,
  SETTING_DISMISSED_VISIT_KEYS,
} from "@/db/repo";

/**
 * Versioned Archive backup (#12) — the escape hatch from device-bound
 * storage (ADR-0001) and the future encrypted-sync payload: the same shape
 * on the wire later.
 */

export const ARCHIVE_FORMAT = "map-diary-backup";
export const ARCHIVE_VERSION = 1;

export interface Archive {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  exportedAt: string;
  places: Place[];
  visits: Visit[];
  movements: Movement[];
  trips: Trip[];
  imports: ImportRecord[];
  /** Every setting except the two dismissal memories, which get top-level fields. */
  settings: Record<string, unknown>;
  dismissedTripRanges: DismissedTripRange[];
  dismissedVisitKeys: string[];
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === "object" && value !== null ? (value as Json) : null;
}

/** Snapshot every table plus the dismissal memories into one Archive. */
export async function buildArchive(): Promise<Archive> {
  const db = getDb();
  const [places, visits, movements, trips, imports, settingRows] =
    await Promise.all([
      db.places.toArray(),
      db.visits.toArray(),
      db.movements.toArray(),
      db.trips.toArray(),
      db.imports.toArray(),
      db.settings.toArray(),
    ]);

  const settings: Record<string, unknown> = {};
  let dismissedTripRanges: DismissedTripRange[] = [];
  let dismissedVisitKeys: string[] = [];
  for (const row of settingRows) {
    if (row.key === SETTING_DISMISSED_TRIP_RANGES) {
      dismissedTripRanges = (row.value as DismissedTripRange[]) ?? [];
    } else if (row.key === SETTING_DISMISSED_VISIT_KEYS) {
      dismissedVisitKeys = (row.value as string[]) ?? [];
    } else {
      settings[row.key] = row.value;
    }
  }

  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    places,
    visits,
    movements,
    trips,
    imports,
    settings,
    dismissedTripRanges,
    dismissedVisitKeys,
  };
}

/** Human-readable output — pretty-printed, one record per few lines. */
export function serializeArchive(archive: Archive): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

/**
 * Parse + validate an uploaded archive. Rejects anything that is not an
 * nksha archive of a known version with clear, user-facing messages.
 */
export function parseArchive(input: unknown): Archive {
  const root = asObject(input);
  if (!root || root.format !== ARCHIVE_FORMAT) {
    throw new Error(
      "This file is not an nksha archive — look for the .json file you exported from Settings.",
    );
  }
  const version = root.version;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error("This archive has no readable format version.");
  }
  if (version > ARCHIVE_VERSION) {
    throw new Error(
      `This archive uses format v${version}, which is newer than this app understands (v${ARCHIVE_VERSION}). Update nksha first.`,
    );
  }
  if (version < 1) {
    throw new Error(`This archive's format version (${version}) is not valid.`);
  }
  for (const key of ["places", "visits", "movements", "trips", "imports"] as const) {
    if (!Array.isArray(root[key])) {
      throw new Error(`This archive is damaged: "${key}" section is missing.`);
    }
  }
  return root as unknown as Archive;
}

export interface RestoreOutcome {
  places: number;
  visits: number;
  movements: number;
  trips: number;
  imports: number;
}

/**
 * Upsert every record by id. Merges into whatever exists — restoring over
 * an empty device reproduces the export byte-for-byte; restoring over
 * live data fills gaps without deleting anything.
 */
export async function restoreArchive(archive: Archive): Promise<RestoreOutcome> {
  const db = getDb();
  return db.transaction(
    "rw",
    [db.places, db.visits, db.movements, db.trips, db.imports, db.settings],
    async (): Promise<RestoreOutcome> => {
      await db.places.bulkPut(archive.places);
      await db.visits.bulkPut(archive.visits);
      await db.movements.bulkPut(archive.movements);
      await db.trips.bulkPut(archive.trips);
      await db.imports.bulkPut(archive.imports);

      await db.settings.bulkPut([
        ...Object.entries(archive.settings).map(([key, value]) => ({ key, value })),
        { key: SETTING_DISMISSED_TRIP_RANGES, value: archive.dismissedTripRanges ?? [] },
        { key: SETTING_DISMISSED_VISIT_KEYS, value: archive.dismissedVisitKeys ?? [] },
      ]);

      return {
        places: archive.places.length,
        visits: archive.visits.length,
        movements: archive.movements.length,
        trips: archive.trips.length,
        imports: archive.imports.length,
      };
    },
  );
}
