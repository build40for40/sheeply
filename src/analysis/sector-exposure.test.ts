import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { sectorExposure } from "./sector-exposure.ts";

describe("sectorExposure", () => {
  const dataset = fixtureDataset();
  const result = sectorExposure(buildInvestmentHistory(dataset), dataset.companies);

  it("counts a company once per industry and ignores same-named sector tags", () => {
    expect(result.distribution.map((d) => [d.name, d.companies, d.share])).toEqual([
      ["Health", 2, 0.5],
      ["Enterprise Software", 1, 0.25],
      ["Fintech", 1, 0.25],
      ["Robotics", 1, 0.25],
    ]);
  });

  it("uses labelled companies as the denominator and lets shares exceed 100%", () => {
    expect(result).toMatchObject({ first_investments: 5, without_industry: 1, labelled: 4, with_multiple_industries: 1, label_assignments: 5 });
    expect(result.distribution.reduce((sum, d) => sum + d.share!, 0)).toBe(1.25);
    expect(result.classification.exclusive_sector_classification_available).toBe(false);
  });

  it("describes breadth with fractional weights for multi-industry companies", () => {
    expect(result.breadth).toEqual({ distinct_industries: 4, top_industry_share: 0.5, effective_number_of_industries: 2.91 });
  });
});
