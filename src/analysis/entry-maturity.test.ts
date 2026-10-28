import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { entryMaturity } from "./entry-maturity.ts";
import { buildInvestmentHistory } from "./investments.ts";

describe("entryMaturity", () => {
  it("buckets first investments by round label and explains the unknowns", () => {
    const result = entryMaturity(buildInvestmentHistory(fixtureDataset()));
    expect(result.companies_with_initial_investment).toBe(5);
    expect(result.known_stage).toBe(3);
    expect(result.distribution.pre_seed).toEqual({ count: 1, share: 0.3333 });
    expect(result.distribution.seed).toEqual({ count: 2, share: 0.6667 });
    expect(result.distribution.series_a).toEqual({ count: 0, share: 0 });
    expect(result.unknown_stage_breakdown.no_round_label_by_standardized_round).toEqual({ Growth: 1, Seed: 1 });
  });

  it("never measures stage from rounds after the first investment", () => {
    const result = entryMaturity(buildInvestmentHistory(fixtureDataset()));
    expect(result.distribution.series_b_plus.count).toBe(0);
    expect(result.initial_rounds_by_standardized_round["Series A"]).toBeUndefined();
  });
});
