import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { Layout } from "@/routes/Layout";

/**
 * Every route is a separate chunk (#bundle-budget). MapLibre (the heaviest
 * dependency by far) is only reachable through these route chunks, so a
 * first paint never downloads it; the map views pull it in on demand.
 */
const MapView = lazy(() => import("@/routes/MapView"));
const ImportView = lazy(() => import("@/routes/ImportView"));
const TripsView = lazy(() => import("@/routes/TripsView"));
const PlaybackView = lazy(() => import("@/routes/PlaybackView"));
const DashboardView = lazy(() => import("@/routes/DashboardView"));
const SettingsView = lazy(() => import("@/routes/SettingsView"));

/** Heatmap is now an Atlas layer: /heatmap redirects to /?layer=heat. */
function HeatmapRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("layer", "heat");
  return <Navigate to={`/?${next.toString()}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<RouteFallback />}>
              <MapView />
            </Suspense>
          }
        />
        <Route
          path="import"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ImportView />
            </Suspense>
          }
        />
        <Route
          path="trips"
          element={
            <Suspense fallback={<RouteFallback />}>
              <TripsView />
            </Suspense>
          }
        />
        <Route
          path="playback"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PlaybackView />
            </Suspense>
          }
        />
        <Route path="heatmap" element={<HeatmapRedirect />} />
        <Route
          path="dashboard"
          element={
            <Suspense fallback={<RouteFallback />}>
              <DashboardView />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<RouteFallback />}>
              <SettingsView />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center" role="status">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

