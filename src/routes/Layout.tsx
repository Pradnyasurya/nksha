import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3,
  Luggage,
  Map as MapIcon,
  Menu,
  Play,
  Settings,
  X,
} from "lucide-react";
import { getDb } from "@/db/db";
import { getBasemapStyle } from "@/db/repo";
import { cn } from "@/lib/cn";
import { BrandMark } from "@/components/BrandMark";
import { WelcomeView } from "@/routes/WelcomeView";

/**
 * Primary destinations stay visible everywhere; Import / Heatmap / Settings
 * are secondary actions. Desktop shows them inline in the header; mobile
 * keeps four bottom tabs plus a header menu (#P0, #nav-redesign).
 */
const MOBILE_TABS = [
  { to: "/", shortLabel: "Map", end: true, Icon: MapIcon },
  { to: "/playback", shortLabel: "Story", Icon: Play },
  { to: "/dashboard", shortLabel: "Insights", Icon: BarChart3 },
  { to: "/trips", shortLabel: "Trips", Icon: Luggage },
];

const SECONDARY_ROUTES = [
  { to: "/heatmap", label: "Heatmap" },
  { to: "/import", label: "Import" },
  { to: "/settings", label: "Settings" },
];

function desktopLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "flex min-h-11 items-center whitespace-nowrap rounded-md px-3 py-2 text-sm",
    isActive
      ? "bg-secondary font-medium text-secondary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function Layout() {
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  // undefined while loading — never flash either the welcome screen or the
  // navigation chrome before the database has answered.
  const visitCount = useLiveQuery(() => getDb().visits.count(), []);
  const dark = style === "dark";
  const loaded = typeof visitCount === "number";
  const firstRun = loaded && visitCount === 0;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={cn("flex h-dvh min-w-0 flex-col overflow-hidden", dark && "dark")}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      {!firstRun && loaded && (
        <header className="shrink-0 border-b border-border bg-card">
          <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-1 px-3 py-2 sm:px-4">
            <NavLink
              to="/"
              end
              aria-label="nksha home"
              className="mr-2 flex size-11 items-center justify-center rounded-md"
            >
              <BrandMark />
              <span className="sr-only">nksha</span>
            </NavLink>

            {/* Desktop: primary groups + secondary actions inline. */}
            <nav
              aria-label="Primary"
              className="hidden min-w-0 items-center gap-1 md:flex"
            >
              <NavLink to="/" end className={desktopLinkClass}>
                Explore
              </NavLink>
              <NavLink to="/playback" className={desktopLinkClass}>
                Story
              </NavLink>
              <span className="mx-1 flex items-center gap-0.5 rounded-lg border border-border px-1 py-0.5">
                <span className="pl-1.5 pr-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Insights
                </span>
                <NavLink to="/dashboard" className={desktopLinkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/heatmap" className={desktopLinkClass}>
                  Heatmap
                </NavLink>
              </span>
              <NavLink to="/trips" className={desktopLinkClass}>
                Trips
              </NavLink>
            </nav>

            <div className="ml-auto hidden items-center gap-1 md:flex">
              <NavLink to="/import" className={desktopLinkClass}>
                Import
              </NavLink>
              <NavLink
                to="/settings"
                aria-label="Settings"
                className={desktopLinkClass}
              >
                <Settings size={16} aria-hidden />
              </NavLink>
            </div>

            {/* Mobile: compact header with a menu for secondary destinations. */}
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="secondary-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X size={20} aria-hidden />
              ) : (
                <Menu size={20} aria-hidden />
              )}
            </button>
          </div>

          {menuOpen && (
            <nav
              id="secondary-menu"
              aria-label="Secondary"
              className="border-t border-border bg-card px-3 pb-3 pt-1 md:hidden"
            >
              {SECONDARY_ROUTES.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "mt-1 flex min-h-11 items-center rounded-md px-3 text-sm",
                      isActive
                        ? "bg-secondary font-medium text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
        </header>
      )}

      <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1">
        {firstRun ? <WelcomeView /> : <Outlet />}
      </main>

      {/* Mobile bottom navigation: the four main destinations. */}
      {!firstRun && loaded && (
        <nav
          aria-label="Primary"
          className="shrink-0 border-t border-border bg-card md:hidden"
        >
          <ul className="grid grid-cols-4">
            {MOBILE_TABS.map(({ to, shortLabel, end, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px]",
                      isActive
                        ? "font-semibold text-primary"
                        : "text-muted-foreground hover:bg-muted",
                    )
                  }
                >
                  <Icon size={20} aria-hidden />
                  {shortLabel}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
