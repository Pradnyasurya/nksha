/** Local-time day keys (`YYYY-MM-DD`) — the currency of Trip windows. */

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayKeyToDate(dayKeyStr: string): Date {
  const [y, m, d] = dayKeyStr.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid day key: ${dayKeyStr}`);
  return new Date(y, m - 1, d);
}

export function addDays(dayKeyStr: string, days: number): string {
  const d = dayKeyToDate(dayKeyStr);
  d.setDate(d.getDate() + days);
  return dayKey(d.getTime());
}

/** Inclusive list of day keys between two day keys. */
export function eachDay(startDay: string, endDay: string): string[] {
  const out: string[] = [];
  let cursor = startDay;
  while (cursor <= endDay) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function isValidDayKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(dayKeyToDate(value).getTime())
  );
}
