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

/** A rate with the counts behind it, so every percentage can be checked against its denominator. */
export interface Rate {
  numerator: number;
  denominator: number;
  value: number | null;
}

export const rate = (numerator: number, denominator: number): Rate => ({ numerator, denominator, value: ratio(numerator, denominator) });

export function tally(values: Iterable<string>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)));
}

export interface Summary {
  n: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
}

/** Quartiles by linear interpolation between order statistics, rounded to two decimals. */
export function summarise(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number | null => {
    if (sorted.length === 0) return null;
    const position = (sorted.length - 1) * q;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    const value = sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
    return Math.round(value * 100) / 100;
  };
  return { n: sorted.length, min: at(0), p25: at(0.25), median: at(0.5), p75: at(0.75), max: at(1) };
}
