import { useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3,
  BookOpen,
  HardDriveDownload,
  Map as MapIcon,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { getDb } from "@/db/db";
import { getBasemapStyle } from "@/db/repo";
import { cn } from "@/lib/cn";
import { BrandMark } from "@/components/BrandMark";
import { WelcomeView } from "@/routes/WelcomeView";

/**
 * Three primary destinations — Atlas, Stories, Insights — with Import and
 * Settings as utilities. Desktop and tablet show a slim left rail; mobile
 * keeps a three-tab bottom bar and puts utilities in a header "More" sheet.
 */

const PRIMARY = [
  { to: "/", label: "Atlas", shortLabel: "Atlas", end: true, Icon: MapIcon },
  { to: "/trips", label: "Stories", shortLabel: "Stories", Icon: BookOpen },
  {
    to: "/dashboard",
    label: "Insights",
    shortLabel: "Insights",
    Icon: BarChart3,
  },
];

const UTILITIES = [
  { to: "/import", label: "Import", Icon: HardDriveDownload },
  { to: "/settings", label: "Settings", Icon: Settings },
];

export function Layout() {
  const { pathname } = useLocation();
  const style = useLiveQuery(() => getBasemapStyle(), [], "dark");
  // undefined while loading — never flash either the welcome screen or the
  // navigation chrome before the database has answered.
  const visitCount = useLiveQuery(() => getDb().visits.count(), []);
  const dark = style === "dark";
  const loaded = typeof visitCount === "number";
  const firstRun = loaded && visitCount === 0;
  // The welcome story owns only the Atlas route. /import and /settings must
  // stay reachable on a fresh install, or the CTA loops back to the same
  // screen (#first-run).
  const showWelcome = firstRun && pathname === "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Close the More sheet whenever the route changes: the sheet's open state
  // is keyed to the current path, so a path change resets it without an
  // effect (the React-documented "adjusting state on prop change" pattern).
  const [moreKey, setMoreKey] = useState([location.pathname]);
  if (moreKey[0] !== location.pathname) {
    setMoreKey([location.pathname]);
    setMoreOpen(false);
  }

  return (
    <div
      className={cn(
        "flex h-dvh min-w-0 overflow-hidden",
        dark && "dark",
        // Row on mobile (content + bottom bar); row-with-rail on desktop.
        "flex-col md:flex-row",
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      {!firstRun && loaded && (
        <>
          {/* Desktop left rail */}
          <nav
            aria-label="Primary"
            className="hidden shrink-0 flex-col border-r border-border bg-card py-3 md:flex md:w-[232px]"
          >
            <NavLink
              to="/"
              end
              aria-label="nksha home"
              className="mb-4 flex items-center gap-2.5 px-4"
            >
              <BrandMark />
              <span className="font-display text-lg font-semibold tracking-tight">
                nksha
              </span>
            </NavLink>

            <ul className="flex flex-1 flex-col gap-0.5 px-2">
              {PRIMARY.map(({ to, label, end, Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px]",
                        isActive
                          ? "bg-secondary font-semibold text-secondary-foreground"
                          : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                      )
                    }
                  >
                    <Icon size={18} aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>

            {/* Local-data status: factual, no cloud implication. */}
            <p className="mx-4 mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-positive"
              />
              Stored in this browser
            </p>

            <ul className="flex flex-col gap-0.5 border-t border-border px-2 pt-2">
              {UTILITIES.map(({ to, label, Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm",
                        isActive
                          ? "bg-secondary font-medium text-secondary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )
                    }
                  >
                    <Icon size={16} aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Mobile compact header */}
          <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-3 py-1.5 md:hidden">
            <NavLink to="/" end aria-label="nksha home" className="flex size-11 items-center justify-center">
              <BrandMark />
              <span className="sr-only">nksha</span>
            </NavLink>
            <button
              ref={moreButtonRef}
              type="button"
              aria-expanded={moreOpen}
              aria-controls="secondary-menu"
              aria-label={moreOpen ? "Close menu" : "More options"}
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setMoreOpen((open) => !open)}
            >
              {moreOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </header>

          {moreOpen && (
            <nav
              id="secondary-menu"
              aria-label="Secondary"
              className="border-b border-border bg-card px-3 pb-3 pt-1 md:hidden"
            >
              {UTILITIES.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "mt-1 flex min-h-12 items-center gap-3 rounded-md px-3 text-[15px]",
                      isActive
                        ? "bg-secondary font-medium text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <Icon size={18} aria-hidden />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1">
          {showWelcome ? <WelcomeView /> : <Outlet />}
        </main>

        {/* Mobile bottom navigation: exactly three destinations (#nav). */}
        {!firstRun && loaded && (
          <nav
            aria-label="Primary"
            className="shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            <ul className="grid grid-cols-3">
              {PRIMARY.map(({ to, shortLabel, end, Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs",
                        isActive
                          ? "font-semibold text-primary"
                          : "font-medium text-muted-foreground hover:bg-muted",
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
    </div>
  );
}
