import { Route, Routes } from "react-router-dom";
import { Layout } from "@/routes/Layout";
import MapView from "@/routes/MapView";
import ImportView from "@/routes/ImportView";
import TripsView from "@/routes/TripsView";
import DashboardView from "@/routes/DashboardView";
import SettingsView from "@/routes/SettingsView";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MapView />} />
        <Route path="import" element={<ImportView />} />
        <Route path="trips" element={<TripsView />} />
        <Route path="dashboard" element={<DashboardView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}
