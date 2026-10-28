import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { analyse } from "./analyse.ts";

describe("dataQuality", () => {
  const { dataQuality } = analyse(fixtureDataset());

  it("accounts for every portfolio row", () => {
    expect(dataQuality.portfolio.by_status).toEqual({
      initial_identified: 5,
      no_round_attribution: 1,
      rounds_not_matched: 1,
      participation_undisclosed: 0,
      not_a_company: 1,
    });
    expect(dataQuality.funding_histories.companies_without_any_round).toBe(1);
  });

  it("measures how often Dealroom flags any lead at all", () => {
    expect(dataQuality.lead_flags.participant_flags).toEqual({ true: 9, false: 9, null: 1 });
    expect(dataQuality.lead_flags.rounds_with_a_flagged_lead).toEqual({ numerator: 8, denominator: 10, value: 0.8 });
  });

  it("lists exclusions with their reasons", () => {
    expect(dataQuality.coverage.lead_status).toEqual({ numerator: 3, denominator: 5, value: 0.6 });
    expect(dataQuality.exclusions).toContainEqual({
      output: "investment_leadership",
      reason: "is_lead false but nobody on the first-investment round is flagged as lead",
      count: 1,
    });
  });
});
