import { useLiveQuery } from "dexie-react-hooks";
import { getBasemapStyle } from "@/db/repo";

export default function TripsView() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Trips appear once you declare or import them. (Current basemap: {style})
    </div>
  );
}
