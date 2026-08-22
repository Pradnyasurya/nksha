import type { StyleSpecification } from "maplibre-gl";
import type { BasemapStyle } from "@/db/schema";

export type CartoFlavor = "dark" | "light";

export type ResolvedMapStyle =
  | { kind: "carto"; flavor: CartoFlavor }
  | { kind: "custom"; url: string };

const CARTO_TILE_PATHS: Record<CartoFlavor, string> = {
  dark: "dark_all",
  light: "light_all",
};

const CARTO_SUBDOMAINS = ["a", "b", "c", "d"] as const;

export function resolveMapStyle(
  preference: BasemapStyle,
  customUrl: string,
): ResolvedMapStyle {
  const trimmed = customUrl.trim();
  if (trimmed) return { kind: "custom", url: trimmed };
  return { kind: "carto", flavor: preference === "light" ? "light" : "dark" };
}

export function isValidStyleUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildCartoStyle(flavor: CartoFlavor): StyleSpecification {
  const tiles = CARTO_SUBDOMAINS.map(
    (s) =>
      `https://${s}.basemaps.cartocdn.com/${CARTO_TILE_PATHS[flavor]}/{z}/{x}/{y}@2x.png`,
  );
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color":
            flavor === "dark" ? "#0e0e10" : "#fafaf8",
        },
      },
      { id: "carto-raster", type: "raster", source: "carto" },
    ],
  };
}
