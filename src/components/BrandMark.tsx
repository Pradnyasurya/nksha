/**
 * The nksha mark: a compass rose folded into a location pin — "personal
 * cartography". Pure inline SVG so it ships with zero network cost.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="nksha logo"
      className="shrink-0"
    >
      {/* pin body */}
      <path
        d="M16 2C9.9 2 5 6.9 5 13c0 8 11 17 11 17s11-9 11-17c0-6.1-4.9-11-11-11Z"
        fill="var(--primary)"
      />
      {/* contour rings */}
      <circle cx="16" cy="12.5" r="7.5" fill="none" stroke="color-mix(in oklab, var(--primary-foreground) 30%, transparent)" strokeWidth="1" />
      <circle cx="16" cy="12.5" r="4.5" fill="none" stroke="color-mix(in oklab, var(--primary-foreground) 45%, transparent)" strokeWidth="1" />
      {/* compass needle */}
      <path d="M16 7.5l2.6 5-2.6 5-2.6-5z" fill="var(--primary-foreground)" />
      <circle cx="16" cy="12.5" r="1.1" fill="var(--primary)" />
    </svg>
  );
}
