import { describe, expect, it } from "vitest";
import { fixtureDataset, roundOf } from "../../tests/fixtures/dataset.ts";
import { INVESTOR } from "../../tests/fixtures/dealroom.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { leadStatus, leadership } from "./leadership.ts";

describe("leadStatus", () => {
  const dataset = fixtureDataset();

  it("separates sole leads from rounds with several leads", () => {
    expect(leadStatus(roundOf(dataset, 11), INVESTOR.uuid)).toBe("sole_lead");
    expect(leadStatus(roundOf(dataset, 81), INVESTOR.uuid)).toBe("co_lead");
  });

  it("only calls a false flag a non-lead when someone else is flagged as lead", () => {
    expect(leadStatus(roundOf(dataset, 21), INVESTOR.uuid)).toBe("not_led");
    expect(leadStatus(roundOf(dataset, 31), INVESTOR.uuid)).toBe("no_lead_recorded");
  });

  it("treats a null flag as unknown", () => {
    expect(leadStatus(roundOf(dataset, 41), INVESTOR.uuid)).toBe("unknown");
  });
});

describe("leadership", () => {
  it("computes rates over rounds with a known lead and reports the rest", () => {
    const { initial_rounds } = leadership(buildInvestmentHistory(fixtureDataset()));
    expect(initial_rounds).toMatchObject({
      rounds: 5,
      led: 2,
      sole_lead: 1,
      co_lead: 1,
      not_led: 1,
      no_lead_recorded: 1,
      unknown: 1,
      known: 3,
      led_share_of_known: 0.6667,
      lead_status_coverage: 0.6,
      led_share_if_unflagged_means_not_led: 0.5,
    });
  });
});
