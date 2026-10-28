import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { entryMaturity } from "./entry-maturity.ts";
import { buildInvestmentHistory } from "./investments.ts";

const result = () => entryMaturity(buildInvestmentHistory(fixtureDataset()));

describe("entryMaturity", () => {
  it("distributes first investments across stages with unknown as its own bucket", () => {
    const { distribution, first_investments, known_stage } = result();
    expect(first_investments).toBe(5);
    expect(known_stage).toBe(3);
    expect(distribution.pre_seed).toEqual({ count: 1, share: 0.2, share_of_known_stage: 0.3333 });
    expect(distribution.seed).toEqual({ count: 2, share: 0.4, share_of_known_stage: 0.6667 });
    expect(distribution.unknown).toEqual({ count: 2, share: 0.4, share_of_known_stage: null });
  });

  it("explains unknown stages by Dealroom's fallback field without using it", () => {
    expect(result().unknown_breakdown.no_round_label_by_standardized_round).toEqual({ Growth: 1, Seed: 1 });
  });

  it("never measures stage from rounds after the first investment", () => {
    const { distribution, first_investments_by_standardized_round } = result();
    expect(distribution.series_a.count).toBe(0);
    expect(first_investments_by_standardized_round["Series A"]).toBeUndefined();
  });

  it("separates the investor's first round from the company's first round", () => {
    const { entry_position } = result().explanatory_attributes;
    expect(entry_position.prior_vc_rounds["0"].count).toBe(4);
    expect(entry_position.prior_vc_rounds["1"].count).toBe(1);
    expect(entry_position.entered_at_company_first_known_vc_round).toEqual({ numerator: 4, denominator: 5, value: 0.8 });
  });

  it("reports company age and prior capital at entry as unscored context", () => {
    const { company_age_at_entry_years, prior_vc_capital } = result().explanatory_attributes;
    expect(company_age_at_entry_years.summary).toMatchObject({ n: 5, median: 3, p25: 2, p75: 4 });
    expect(prior_vc_capital).toMatchObject({ currency: "USD", complete: 5, incomplete: 0 });
    expect(prior_vc_capital.summary_of_complete.max).toBe(500_000);
  });
});
