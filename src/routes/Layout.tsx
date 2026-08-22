import { NavLink, Outlet } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { getBasemapStyle } from "@/db/repo";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { to: "/", label: "Map", end: true },
  { to: "/import", label: "Import" },
  { to: "/trips", label: "Trips" },
  { to: "/playback", label: "Playback" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/heatmap", label: "Heatmap" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  const dark = style === "dark";

  return (
    <div className={cn("flex h-screen flex-col", dark && "dark")}>
      <header className="border-b border-border bg-card">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
          <span className="mr-4 font-semibold tracking-tight">nksha</span>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  isActive
                    ? "bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
