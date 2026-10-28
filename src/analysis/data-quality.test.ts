import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { analyse } from "./analyse.ts";

describe("dataQuality", () => {
  it("accounts for every portfolio row and every exclusion", () => {
    const { dataQuality } = analyse(fixtureDataset());
    expect(dataQuality.portfolio.by_status).toEqual({
      initial_identified: 5,
      no_round_attribution: 1,
      rounds_not_matched: 1,
      not_a_company: 1,
    });
    expect(dataQuality.rounds.year_precision_only).toBe(2);
    expect(dataQuality.rounds.companies_without_any_round).toBe(1);
    expect(dataQuality.coverage.lead_status).toBe(0.6);
    expect(dataQuality.exclusions).toContainEqual({
      metric: "leadership",
      reason: "no participant on the initial round is flagged as lead",
      count: 1,
    });
  });
});
