import { Link } from "react-router-dom";
import {
  Lock,
  MapPin,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

const BENEFITS = [
  {
    Icon: MapPin,
    title: "Explore your places",
    body: "Every stay becomes a pin on your own private map.",
  },
  {
    Icon: Play,
    title: "Replay your years",
    body: "Watch trips draw themselves across months and years.",
  },
  {
    Icon: Sparkles,
    title: "Find your patterns",
    body: "Dwell heat, top places, and trips you never wrote down.",
  },
];

/** Hand-drawn synthetic preview — no real coordinates, purely decorative. */
function PreviewArt() {
  const dots: Array<[number, number, number]> = [
    [22, 62, 0.9],
    [30, 48, 0.7],
    [38, 55, 0.5],
    [47, 40, 0.8],
    [58, 46, 0.6],
    [64, 33, 1],
    [74, 39, 0.75],
    [80, 27, 0.55],
  ];
  const path = dots.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  return (
    <svg
      viewBox="0 0 100 78"
      aria-hidden="true"
      data-testid="welcome-preview"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* grid */}
      {[15, 30, 45, 60, 75, 90].map((x) => (
        <line key={x} x1={x} y1="4" x2={x} y2="74" stroke="var(--border)" strokeWidth="0.25" />
      ))}
      {[14, 28, 42, 56, 70].map((y) => (
        <line key={y} x1="6" y1={y} x2="96" y2={y} stroke="var(--border)" strokeWidth="0.25" />
      ))}
      {/* route trace */}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="2.2 1.6" opacity="0.85" />
      {/* pins */}
      {dots.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r * 3.2} fill="var(--primary)" opacity="0.16" />
          <circle cx={x} cy={y} r={r * 1.6} fill="var(--primary)" opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}

export function WelcomeView() {
  return (
    <div className="paper-texture h-full min-w-0 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10 sm:py-14">
        <header className="flex flex-col items-center gap-4 text-center">
          <BrandMark size={44} />
          <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
            nksha · personal cartography
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Your life, mapped privately.
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            nksha turns the timeline Google already keeps about you into an
            atlas only you can see — it never leaves this device.
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-44 border-b border-border p-3 sm:h-52">
            <PreviewArt />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
            <span>8 years · 214 places · 19 trips</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-accent px-2 py-0.5 font-medium text-foreground">
              <Lock size={11} aria-hidden /> Sample preview
            </span>
          </div>
        </div>

        <section className="flex justify-center">
          <Link
            to="/import"
            className="flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground shadow hover:opacity-90"
          >
            <Upload size={18} aria-hidden />
            Import your timeline
          </Link>
        </section>

        <ul className="grid gap-3 sm:grid-cols-3">
          {BENEFITS.map(({ Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-border bg-card p-4">
              <Icon size={20} aria-hidden className="text-primary" />
              <h2 className="mt-2 text-sm font-semibold">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ul>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">
            What you will need
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">1.</span>
              Go to takeout.google.com and request only “Maps (your places)”.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">2.</span>
              Unzip the archive when it is ready.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">3.</span>
              Pick the Timeline JSON file — usually{" "}
              <code className="rounded bg-muted px-1">
                Location History (Timeline).json
              </code>{" "}
              or a file inside the <em>Timeline</em> folder.
            </li>
          </ol>
        </section>

        <footer className="flex flex-col items-center gap-3 pb-4 text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-accent px-3 py-1.5 text-xs font-medium">
            <ShieldCheck size={13} aria-hidden />
            Your data stays in this browser — parsing and storage are local.
          </p>
          <Link
            to="/settings"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Settings
          </Link>
        </footer>
      </div>
    </div>
  );
}
