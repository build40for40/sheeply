import { describe, expect, it } from "vitest";
import { dateSpan, definitelyBefore, overlaps } from "./partial-date.ts";

describe("dateSpan", () => {
  it("expands each precision to the days it could mean", () => {
    expect(dateSpan("2019")).toEqual({ start: "2019-01-01", end: "2019-12-31", precision: "year" });
    expect(dateSpan("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29", precision: "month" });
    expect(dateSpan("2024-02-14")).toEqual({ start: "2024-02-14", end: "2024-02-14", precision: "day" });
    expect(dateSpan(null)).toBeNull();
  });

  it("treats a year and a month inside it as overlapping, not ordered", () => {
    const year = dateSpan("2019")!;
    const month = dateSpan("2019-06")!;
    expect(overlaps(year, month)).toBe(true);
    expect(definitelyBefore(year, month)).toBe(false);
    expect(definitelyBefore(dateSpan("2018-12")!, year)).toBe(true);
  });
});
