import { useLiveQuery } from "dexie-react-hooks";
import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { BasemapStyle } from "@/db/schema";
import { getBasemapStyle, getCustomStyleUrl } from "@/db/repo";
import {
  buildCartoStyle,
  isValidStyleUrl,
  resolveMapStyle,
} from "@/features/map/mapStyles";
import {
  fetchValidatedStyle,
  setStylePreservingCamera,
} from "@/features/map/styleLoader";

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const appliedKeyRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const preference =
    useLiveQuery(() => getBasemapStyle(), [], "dark" as BasemapStyle);
  const customUrl = useLiveQuery(() => getCustomStyleUrl(), [], "");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: buildCartoStyle("dark"),
    });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      appliedKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const key = `${preference}|${customUrl.trim()}`;
    if (key === appliedKeyRef.current) return;

    let cancelled = false;
    const resolved = resolveMapStyle(preference, customUrl);

    async function apply() {
      if (resolved.kind === "carto") {
        setStylePreservingCamera(map!, buildCartoStyle(resolved.flavor));
        appliedKeyRef.current = key;
        setNotice(null);
        return;
      }
      if (!isValidStyleUrl(resolved.url)) {
        fallbackToDefault("Invalid style URL — using default basemap");
        return;
      }
      try {
        const style = await fetchValidatedStyle(resolved.url);
        if (cancelled) return;
        setStylePreservingCamera(map!, style);
        appliedKeyRef.current = key;
        setNotice(null);
      } catch {
        if (!cancelled) {
          fallbackToDefault("Custom style failed to load — using default");
        }
      }
    }

    function fallbackToDefault(message: string) {
      const current = resolveMapStyle(preference, "");
      if (current.kind !== "carto") return;
      setStylePreservingCamera(map!, buildCartoStyle(current.flavor));
      appliedKeyRef.current = key;
      setNotice(message);
    }

    void apply();
    return () => {
      cancelled = true;
    };
  }, [preference, customUrl]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {notice && (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
