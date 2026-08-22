import { useEffect, useMemo, useState } from "react";
import type { Place } from "@/db/schema";
import type {
  CountryWorkerRequest,
  CountryWorkerResponse,
} from "@/workers/countries.worker";

export interface DetectedCountries {
  /** ISO A3 codes matched from Place coordinates. */
  detected: Set<string>;
  /** ISO A3 → name, supplied by the worker so the polygon asset stays lazy. */
  names: Record<string, string>;
  status: "working" | "done" | "error";
}

/**
 * Country detection for the dashboard (#11). Matching runs in a worker; a
 * plain dynamic-import fallback covers exotic browsers without workers.
 * The polygon asset itself is never pulled into the main bundle.
 */
export function useDetectedCountries(places: Place[]): DetectedCountries {
  const signature = useMemo(
    () => places.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
    [places],
  );
  const [result, setResult] = useState<DetectedCountries>({
    detected: new Set(),
    names: {},
    status: "working",
  });

  useEffect(() => {
    if (places.length === 0) return;
    const payload = places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));
    let cancelled = false;

    function apply(response: CountryWorkerResponse): void {
      if (cancelled) return;
      const detected = new Set(
        Object.values(response.matches).filter((v): v is string => v !== null),
      );
      setResult({
        detected,
        names: { ...response.names },
        status: response.error ? "error" : "done",
      });
    }

    if (typeof Worker === "function") {
      const worker = new Worker(
        new URL("../../workers/countries.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<CountryWorkerResponse>) => {
        apply(event.data);
        worker.terminate();
      };
      worker.onerror = () => {
        if (!cancelled) {
          setResult((prev) => ({ ...prev, status: "error" }));
        }
        worker.terminate();
      };
      const request: CountryWorkerRequest = { places: payload };
      worker.postMessage(request);
      return () => {
        cancelled = true;
        worker.terminate();
      };
    }

    void (async () => {
      try {
        const [{ loadCountryPolygons }, { matchCountries }] = await Promise.all([
          import("@/features/countries/polygons"),
          import("@/features/countries/matcher"),
        ]);
        const countries = await loadCountryPolygons();
        const matches = matchCountries(payload, countries);
        const names: Record<string, string> = {};
        for (const poly of countries) names[poly.iso] = poly.name;
        apply({ matches, names });
      } catch {
        if (!cancelled) setResult((prev) => ({ ...prev, status: "error" }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `signature` (not `places`) keeps the worker from respawning on identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (places.length === 0) {
    return { detected: new Set(), names: {}, status: "done" };
  }
  return result;
}
