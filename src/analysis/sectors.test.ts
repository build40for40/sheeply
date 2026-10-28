import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { sectors } from "./sectors.ts";

describe("sectors", () => {
  it("counts a company once per industry and ignores same-named sector tags", () => {
    const dataset = fixtureDataset();
    const result = sectors(buildInvestmentHistory(dataset), dataset.companies);
    expect(result.companies).toBe(5);
    expect(result.with_multiple_industries).toBe(1);
    expect(result.without_industry).toBe(1);
    expect(result.distribution.map((d) => [d.name, d.companies])).toEqual([
      ["Health", 2],
      ["Enterprise Software", 1],
      ["Fintech", 1],
      ["Robotics", 1],
    ]);
    expect(result.distribution.reduce((sum, d) => sum + d.companies, 0)).toBeGreaterThan(result.companies - result.without_industry);
  });
});
