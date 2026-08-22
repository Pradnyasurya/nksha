import { bboxOf, type BBox, type Ring } from "@/lib/geo";

/**
 * Bundled low-resolution country polygons for the Countries visited card
 * (#11). The asset is committed (ADR-0002 zero egress — nothing is fetched
 * at runtime) and loaded through a dynamic import so Vite keeps it out of
 * the main bundle. Coordinates are rounded to ~1 km by
 * scripts/build-countries.mjs; plenty for country matching.
 */

/** `[isoA3, name, rings]` rows produced by scripts/build-countries.mjs. */
type CountryAssetRow = [string, string, number[][][]];

export interface CountryPoly {
  iso: string;
  name: string;
  /** All rings of all polygons; even-odd parity handles holes. */
  rings: Ring[];
  bbox: BBox;
}

export async function loadCountryPolygons(): Promise<CountryPoly[]> {
  const rows = (await import("@/assets/countries.json"))
    .default as unknown as CountryAssetRow[];
  return rows.map(([iso, name, rings]) => {
    const built: Ring[] = rings.map((ring) => ({
      points: ring.map(([lng, lat]) => ({ lng, lat })),
    }));
    return {
      iso,
      name,
      rings: built,
      bbox: unionBbox(built.map(bboxOf)),
    };
  });
}

function unionBbox(boxes: BBox[]): BBox {
  return {
    minLat: Math.min(...boxes.map((b) => b.minLat)),
    maxLat: Math.max(...boxes.map((b) => b.maxLat)),
    minLng: Math.min(...boxes.map((b) => b.minLng)),
    maxLng: Math.max(...boxes.map((b) => b.maxLng)),
  };
}
