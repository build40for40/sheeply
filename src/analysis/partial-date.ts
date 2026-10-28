/** A Dealroom partial date (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) as the span of days it could mean. */
export interface DateSpan {
  start: string;
  end: string;
  precision: "year" | "month" | "day";
}

export function dateSpan(value: string | null): DateSpan | null {
  if (value === null) return null;
  const [year, month, day] = value.split("-");
  if (!year) return null;
  if (day && month) return { start: value, end: value, precision: "day" };
  if (month) {
    const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return { start: `${year}-${month}-01`, end: `${year}-${month}-${String(lastDay).padStart(2, "0")}`, precision: "month" };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, precision: "year" };
}

/** True only when every day `a` could mean falls before every day `b` could mean. */
export const definitelyBefore = (a: DateSpan, b: DateSpan): boolean => a.end < b.start;

export const overlaps = (a: DateSpan, b: DateSpan): boolean => !definitelyBefore(a, b) && !definitelyBefore(b, a);
