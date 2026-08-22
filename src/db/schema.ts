import Dexie, { type Table } from "dexie";

/**
 * Domain language follows CONTEXT.md: Place, Visit, Trip, Home, Import.
 * All timestamps are epoch milliseconds (UTC); day keys are local `YYYY-MM-DD`.
 */

export type Provenance = "declared" | "inferred";

/** A real-world location that visits occur at. One canonical record per placeId. */
export interface Place {
  /** Google placeId verbatim; hand-made places use `manual:<uuid>`. */
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Exactly one place carries isHome = 1 once a Home is declared (#5). */
  isHome: 0 | 1;
  createdAt: number;
}

/** A breadcrumb along the travelled route, minutes from visit arrival (#8). */
export interface TimelinePoint {
  lat: number;
  lng: number;
  offsetMinutes: number;
}

/**
 * A time-spanning stay at a place (arrival/departure). The atomic unit of
 * the product.
 */
export interface Visit {
  id?: number;
  /** `${placeId}:${startTimeMs}` — makes imports idempotent (#3). */
  dedupeKey: string;
  placeId: string;
  startTimeMs: number;
  /** null = still there / open-ended stay. */
  endTimeMs: number | null;
  timelinePath?: TimelinePoint[];
  distanceMeters?: number;
  sourceProbability?: number;
  /** Owning import; null for manual records. */
  importId: string | null;
  createdAt: number;
}

/** A named window of days claiming every Visit inside it (#6, #7). */
export interface Trip {
  id: string;
  name: string;
  startDay: string;
  endDay: string;
  provenance: Provenance;
  createdAt: number;
}

/** Bookkeeping for one imported file (#3) — feeds the report screen. */
export interface ImportRecord {
  id: string;
  fileName: string;
  importedAt: number;
  placesFound: number;
  visitsCreated: number;
  visitsSkipped: number;
  firstVisitTimeMs: number | null;
  lastVisitTimeMs: number | null;
}

export type BasemapStyle = "dark" | "light";

export interface DismissedTripRange {
  startDay: string;
  endDay: string;
}

export class NkshaDB extends Dexie {
  places!: Table<Place, string>;
  visits!: Table<Visit, number>;
  trips!: Table<Trip, string>;
  imports!: Table<ImportRecord, string>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor(name = "nksha") {
    super(name);
    this.version(1).stores({
      places: "id, isHome",
      visits: "++id, &dedupeKey, placeId, startTimeMs",
      trips: "&id, startDay, endDay, provenance",
      imports: "&id, importedAt",
      settings: "&key",
    });
  }
}
