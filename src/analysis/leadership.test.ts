import { describe, expect, it } from "vitest";
import { fixtureDataset, roundOf } from "../../tests/fixtures/dataset.ts";
import { INVESTOR } from "../../tests/fixtures/dealroom.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { investmentLeadership, leadStatus } from "./leadership.ts";

describe("leadStatus", () => {
  const dataset = fixtureDataset();

  it("counts every flagged lead on a multi-lead round", () => {
    expect(leadStatus(roundOf(dataset, 11), INVESTOR.uuid)).toBe("sole_lead");
    expect(leadStatus(roundOf(dataset, 81), INVESTOR.uuid)).toBe("co_lead");
  });

  it("only calls a false flag a non-lead when someone else is flagged as lead", () => {
    expect(leadStatus(roundOf(dataset, 21), INVESTOR.uuid)).toBe("not_led");
    expect(leadStatus(roundOf(dataset, 31), INVESTOR.uuid)).toBe("no_lead_recorded");
  });

  it("treats a null flag as unknown, not as false", () => {
    expect(leadStatus(roundOf(dataset, 41), INVESTOR.uuid)).toBe("unknown");
  });
});

describe("investmentLeadership", () => {
  it("exposes the initial lead rate with its numerator, denominator and completeness", () => {
    const { initial_investments } = investmentLeadership(buildInvestmentHistory(fixtureDataset()));
    expect(initial_investments).toEqual({
      rounds: 5,
      recorded_lead: 2,
      sole_lead: 1,
      co_lead: 1,
      recorded_non_lead: 1,
      false_with_no_lead_on_round: 1,
      null_lead_flag: 1,
      usable_lead_status: 3,
      lead_rate: { numerator: 2, denominator: 3, value: 0.6667 },
      lead_status_completeness: { numerator: 3, denominator: 5, value: 0.6 },
      sensitivity: { lead_rate_if_every_false_is_non_lead: { numerator: 2, denominator: 4, value: 0.5 } },
    });
  });

  it("reports the rate over all participations as a secondary statistic", () => {
    const { all_participations } = investmentLeadership(buildInvestmentHistory(fixtureDataset()));
    expect(all_participations.rounds).toBe(7);
    expect(all_participations.lead_rate).toEqual({ numerator: 2, denominator: 5, value: 0.4 });
  });
});
