import { describe, expect, it } from "vitest";
import { rate, summarise } from "./ratio.ts";

describe("rate", () => {
  it("keeps the counts and returns null for an empty denominator", () => {
    expect(rate(1, 3)).toEqual({ numerator: 1, denominator: 3, value: 0.3333 });
    expect(rate(0, 0)).toEqual({ numerator: 0, denominator: 0, value: null });
  });
});

describe("summarise", () => {
  it("interpolates quartiles", () => {
    expect(summarise([4, 1, 3, 2])).toEqual({ n: 4, min: 1, p25: 1.75, median: 2.5, p75: 3.25, max: 4 });
    expect(summarise([])).toMatchObject({ n: 0, median: null });
  });
});
