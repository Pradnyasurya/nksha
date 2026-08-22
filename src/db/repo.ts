import { getDb } from "./db";
import type {
  BasemapStyle,
  DismissedTripRange,
  ImportRecord,
  Movement,
  Place,
  Trip,
  Visit,
} from "./schema";
import {
  assertValidTripWindow,
  findOverlappingTrip,
  suggestTripName,
} from "@/features/trips/trips";
import { inferTripWindows } from "@/features/trips/inference";

/**
 * Core data operations shared across features. Feature-specific logic lives
 * in its own module; only cross-cutting persistence lands here.
 */

// ---------------------------------------------------------------------------
// Settings (key/value)
// ---------------------------------------------------------------------------

export const SETTING_BASEMAP_STYLE = "basemapStyle";
export const SETTING_CUSTOM_STYLE_URL = "customStyleUrl";
export const SETTING_DISMISSED_TRIP_RANGES = "dismissedTripRanges";
export const SETTING_DISMISSED_VISIT_KEYS = "dismissedVisitKeys";
export const SETTING_MANUAL_COUNTRIES = "manualCountries";

async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb().settings.put({ key, value });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await getDb().settings.get(key);
  return row?.value as T | undefined;
}

export async function getBasemapStyle(): Promise<BasemapStyle> {
  return (await getSetting<BasemapStyle>(SETTING_BASEMAP_STYLE)) ?? "dark";
}

export async function setBasemapStyle(style: BasemapStyle): Promise<void> {
  await setSetting(SETTING_BASEMAP_STYLE, style);
}

export async function getCustomStyleUrl(): Promise<string> {
  return (await getSetting<string>(SETTING_CUSTOM_STYLE_URL)) ?? "";
}

export async function setCustomStyleUrl(url: string): Promise<void> {
  await setSetting(SETTING_CUSTOM_STYLE_URL, url);
}

export async function getDismissedTripRanges(): Promise<DismissedTripRange[]> {
  return (
    (await getSetting<DismissedTripRange[]>(SETTING_DISMISSED_TRIP_RANGES)) ??
    []
  );
}

export async function addDismissedTripRange(
  range: DismissedTripRange,
): Promise<void> {
  const ranges = await getDismissedTripRanges();
  ranges.push(range);
  await setSetting(SETTING_DISMISSED_TRIP_RANGES, ranges);
}

export async function getDismissedVisitKeys(): Promise<Set<string>> {
  return new Set(
    (await getSetting<string[]>(SETTING_DISMISSED_VISIT_KEYS)) ?? [],
  );
}

export async function addDismissedVisitKeys(keys: string[]): Promise<void> {
  const merged = new Set(await getDismissedVisitKeys());
  for (const key of keys) merged.add(key);
  await setSetting(SETTING_DISMISSED_VISIT_KEYS, [...merged]);
}

export async function getManualCountries(): Promise<string[]> {
  return (await getSetting<string[]>(SETTING_MANUAL_COUNTRIES)) ?? [];
}

export async function addManualCountry(isoCode: string): Promise<void> {
  const codes = await getManualCountries();
  if (!codes.includes(isoCode)) {
    codes.push(isoCode);
    await setSetting(SETTING_MANUAL_COUNTRIES, codes);
  }
}

export async function removeManualCountry(isoCode: string): Promise<void> {
  const codes = (await getManualCountries()).filter((c) => c !== isoCode);
  await setSetting(SETTING_MANUAL_COUNTRIES, codes);
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/** Move the single Home flag to `placeId` (#5). Never inferred silently. */
export async function setHomePlace(placeId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.places, async () => {
    const target = await db.places.get(placeId);
    if (!target) throw new Error(`Unknown place: ${placeId}`);
    const current = await db.places.where("isHome").equals(1).toArray();
    const clearing = current
      .filter((p) => p.id !== placeId)
      .map((p) => ({ ...p, isHome: 0 as const }));
    await db.places.bulkPut([...clearing, { ...target, isHome: 1 }]);
  });
}

export async function getHomePlace(): Promise<Place | undefined> {
  const homes = await getDb().places.where("isHome").equals(1).toArray();
  return homes[0];
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/**
 * Rename a Place once; every Visit references it by id, so the change
 * propagates everywhere (#4).
 */
export async function renamePlace(
  placeId: string,
  name: string,
  address?: string,
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.places, async () => {
    const place = await db.places.get(placeId);
    if (!place) throw new Error(`Unknown place: ${placeId}`);
    await db.places.put({
      ...place,
      name,
      address: address !== undefined ? address : place.address,
    });
  });
}

// ---------------------------------------------------------------------------
// Import bundle insertion (idempotent, #3)
// ---------------------------------------------------------------------------

export interface ImportBundle {
  /** Everything except computed counters, which insertImportBundle fills in. */
  importRecord: Pick<ImportRecord, "id" | "fileName" | "importedAt"> & {
    placesFound: number;
  };
  places: Place[];
  visits: Visit[];
  /** Activity segments from the same file (#11); optional for old callers. */
  movements?: Movement[];
}

export interface ImportOutcome {
  placesUpserted: number;
  visitsCreated: number;
  visitsSkipped: number;
  movementsCreated: number;
  movementsSkipped: number;
  firstVisitTimeMs: number | null;
  lastVisitTimeMs: number | null;
}

/**
 * Insert parsed import data transactionally. Visits are deduplicated on the
 * unique `dedupeKey`; duplicates are skipped, not written. Manual records are
 * never touched. Imported places overwrite canonical fields but preserve a
 * user-set Home flag and any manual rename applied after the previous import.
 */
export async function insertImportBundle(
  bundle: ImportBundle,
): Promise<ImportOutcome> {
  const db = getDb();
  return db.transaction(
    "rw",
    [db.places, db.visits, db.movements, db.imports],
    async (): Promise<ImportOutcome> => {
      let placesUpserted = 0;
      for (const incoming of bundle.places) {
        const existing = await db.places.get(incoming.id);
        if (existing) {
          // Preserve user-owned state across re-imports.
          await db.places.put({
            ...incoming,
            name: existing.name || incoming.name,
            isHome: existing.isHome,
            createdAt: existing.createdAt,
          });
        } else {
          await db.places.put(incoming);
          placesUpserted++;
        }
      }

      let created = 0;
      let skipped = 0;
      let first: number | null = null;
      let last: number | null = null;
      for (const visit of bundle.visits) {
        try {
          await db.visits.add(visit);
          created++;
          if (first === null || visit.startTimeMs < first)
            first = visit.startTimeMs;
          const end = visit.endTimeMs ?? visit.startTimeMs;
          if (last === null || end > last) last = end;
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            skipped++;
          } else {
            throw err;
          }
        }
      }

      let movementsCreated = 0;
      let movementsSkipped = 0;
      for (const movement of bundle.movements ?? []) {
        try {
          await db.movements.add(movement);
          movementsCreated++;
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            movementsSkipped++;
          } else {
            throw err;
          }
        }
      }

      const record = {
        ...bundle.importRecord,
        visitsCreated: created,
        visitsSkipped: skipped,
        firstVisitTimeMs: first,
        lastVisitTimeMs: last,
      };
      await db.imports.put(record);

      return {
        placesUpserted,
        visitsCreated: created,
        visitsSkipped: skipped,
        movementsCreated,
        movementsSkipped,
        firstVisitTimeMs: first,
        lastVisitTimeMs: last,
      };
    },
  );
}

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof Error && err.name === "ConstraintError";
}

// ---------------------------------------------------------------------------
// Trips (#6)
// ---------------------------------------------------------------------------

export async function createDeclaredTrip(
  name: string,
  startDay: string,
  endDay: string,
): Promise<Trip> {
  assertValidTripWindow(startDay, endDay);
  const db = getDb();
  const existing = await db.trips.toArray();
  const conflict = findOverlappingTrip(existing, startDay, endDay);
  if (conflict) {
    throw new Error(
      `This window overlaps "${conflict.name}" (${conflict.startDay} – ${conflict.endDay}). Shrink the range or delete that trip first — a visit can belong to at most one trip.`,
    );
  }
  const trip: Trip = {
    id: crypto.randomUUID(),
    name: name.trim() || suggestTripName(startDay, endDay),
    startDay,
    endDay,
    provenance: "declared",
    createdAt: Date.now(),
  };
  await db.trips.put(trip);
  return trip;
}

export async function renameTrip(tripId: string, name: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.trips, async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error(`Unknown trip: ${tripId}`);
    await db.trips.put({ ...trip, name });
  });
}

export async function deleteTrip(tripId: string): Promise<void> {
  await getDb().trips.delete(tripId);
}

export async function tripsByStart(): Promise<Trip[]> {
  return (await getDb().trips.toArray()).sort((a, b) =>
    a.startDay.localeCompare(b.startDay),
  );
}

// ---------------------------------------------------------------------------
// Trip inference (#7)
// ---------------------------------------------------------------------------

/**
 * Mint inferred trips from current data. Runs only at import time or via
 * the explicit re-run action; declared trips are never touched, dismissed
 * ranges are honoured, same input yields same output.
 */
export async function runTripInference(): Promise<number> {
  const db = getDb();
  const [visits, places, trips, dismissedRanges] = await Promise.all([
    db.visits.toArray(),
    db.places.toArray(),
    db.trips.toArray(),
    getDismissedTripRanges(),
  ]);
  const home = places.find((p) => p.isHome === 1);

  return db.transaction("rw", db.trips, async () => {
    let created = 0;
    for (const window of inferTripWindows({
      visits,
      places,
      homePlaceId: home?.id ?? null,
      trips,
      dismissedRanges,
    })) {
      const exists = await db.trips
        .where("startDay")
        .equals(window.startDay)
        .first();
      if (exists) continue;
      await db.trips.put({
        id: crypto.randomUUID(),
        name: window.name,
        startDay: window.startDay,
        endDay: window.endDay,
        provenance: "inferred",
        createdAt: Date.now(),
      });
      created += 1;
    }
    return created;
  });
}

/** Delete an inferred trip AND remember the range so imports can't resurrect it. */
export async function dismissInferredTrip(tripId: string): Promise<void> {
  const trip = await getDb().trips.get(tripId);
  if (!trip) return;
  if (trip.provenance !== "inferred") {
    throw new Error("Only inferred trips can be dismissed");
  }
  await deleteTrip(tripId);
  await addDismissedTripRange({
    startDay: trip.startDay,
    endDay: trip.endDay,
  });
}

/**
 * Re-run suggestions from scratch: wipe all inferred trips (declared ones
 * untouched), then regenerate honouring dismissed memory.
 */
export async function rerunTripInference(): Promise<number> {
  const db = getDb();
  const inferred = await db.trips.where("provenance").equals("inferred").toArray();
  for (const trip of inferred) {
    await db.trips.delete(trip.id);
  }
  return runTripInference();
}

