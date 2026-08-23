import { Link } from "react-router-dom";
import {
  HardDrive,
  HelpCircle,
  Lock,
  ShieldCheck,
  Upload,
  UserX,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

const PRIVACY_FACTS = [
  { Icon: ShieldCheck, text: "Parsed in this browser" },
  { Icon: HardDrive, text: "Stored on this device" },
  { Icon: UserX, text: "No account or telemetry" },
];

/** Hand-drawn synthetic preview — fictional places only, purely decorative. */
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
      {[15, 30, 45, 60, 75, 90].map((x) => (
        <line key={x} x1={x} y1="4" x2={x} y2="74" stroke="var(--border)" strokeWidth="0.25" />
      ))}
      {[14, 28, 42, 56, 70].map((y) => (
        <line key={y} x1="6" y1={y} x2="96" y2={y} stroke="var(--border)" strokeWidth="0.25" />
      ))}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="2.2 1.6" opacity="0.85" />
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
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-5 py-12 sm:py-16">
        <header className="flex flex-col items-center gap-5 text-center">
          <BrandMark size={44} />
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
            nksha · personal cartography
          </p>
          <h1 className="display max-w-xl">Your travels, kept close.</h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Turn your Google Timeline export into a private atlas that stays in
            this browser.
          </p>
        </header>

        {/* Product proof: a large synthetic atlas moment. */}
        <figure className="overflow-hidden rounded-sheet border border-border bg-card shadow-low">
          <div className="h-52 border-b border-border p-4 sm:h-64">
            <PreviewArt />
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div>
              <p className="font-display text-base font-semibold">
                A week in the mountains
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground tabular">
                6 places · 1 story · 214 km travelled
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-accent px-3 py-1 text-xs font-medium text-foreground">
              <Lock size={11} aria-hidden /> Example atlas
            </span>
          </figcaption>
        </figure>

        <section className="flex flex-col items-center gap-3">
          <Link
            to="/import"
            data-testid="welcome-primary-cta"
            className="flex min-h-13 items-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-medium text-primary-foreground shadow-low transition-opacity hover:opacity-90"
          >
            <Upload size={18} aria-hidden />
            Choose timeline file
          </Link>
          <Link
            to="/import#how-to-export"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            <HelpCircle size={15} aria-hidden />
            See how to export it
          </Link>
        </section>

        {/* Compact privacy proof: three facts, one row. */}
        <ul className="mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {PRIVACY_FACTS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon size={16} aria-hidden className="text-positive" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
