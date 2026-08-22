import {
  loadCountryPolygons,
} from "@/features/countries/polygons";
import { matchCountries } from "@/features/countries/matcher";

/**
 * Country matching runs in a worker (#11) so a large Place set never
 * blocks the dashboard. One request per batch; polygons are loaded once.
 */

export interface CountryMatchPlace {
  id: string;
  lat: number;
  lng: number;
}

export interface CountryWorkerRequest {
  places: CountryMatchPlace[];
}

export interface CountryWorkerResponse {
  matches: Record<string, string | null>;
  /** ISO A3 → display name, so the UI never loads the polygon asset itself. */
  names?: Record<string, string>;
  error?: string;
}

let polygonsPromise: Promise<Awaited<ReturnType<typeof loadCountryPolygons>>> | null =
  null;

function ensurePolygons() {
  if (!polygonsPromise) {
    polygonsPromise = loadCountryPolygons().catch((err: unknown) => {
      polygonsPromise = null;
      throw err;
    });
  }
  return polygonsPromise;
}

self.onmessage = (event: MessageEvent<CountryWorkerRequest>) => {
  void (async () => {
    try {
      const countries = await ensurePolygons();
      const matches = matchCountries(event.data.places, countries);
      const names: Record<string, string> = {};
      for (const poly of countries) names[poly.iso] = poly.name;
      const response: CountryWorkerResponse = { matches, names };
      self.postMessage(response);
    } catch (err) {
      const response: CountryWorkerResponse = {
        matches: {},
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  })();
};
