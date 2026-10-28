/** A share rounded to four decimals, or null when the denominator is empty rather than a misleading zero. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

export interface CountShare {
  count: number;
  share: number | null;
}

export const countShare = (count: number, denominator: number): CountShare => ({ count, share: ratio(count, denominator) });

export function tally(values: Iterable<string>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)));
}
