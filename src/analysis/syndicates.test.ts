import { describe, expect, it } from "vitest";
import { fixtureDataset, toRound } from "../../tests/fixtures/dataset.ts";
import { COMPANIES, INVESTOR, LEAD_ONE, LEAD_TWO, participant, round } from "../../tests/fixtures/dealroom.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { syndicates } from "./syndicates.ts";

describe("syndicates", () => {
  it("counts recurring co-investors across every participation", () => {
    const { co_investors } = syndicates(buildInvestmentHistory(fixtureDataset()));
    expect(co_investors.rounds_considered).toBe(7);
    expect(co_investors.top.map((p) => [p.name, p.rounds])).toEqual([
      ["Northwind Capital", 3],
      ["Orchard Seed Fund", 3],
      ["Pat Example", 2],
      ["Blue Harbour Partners", 1],
    ]);
    expect(co_investors.repeat_co_investors).toBe(3);
  });

  it("measures lead-partner dependence on initial rounds led by someone else", () => {
    const { lead_partners } = syndicates(buildInvestmentHistory(fixtureDataset()));
    expect(lead_partners.rounds).toBe(1);
    expect(lead_partners.top_lead?.name).toBe("Northwind Capital");
    expect(lead_partners.top_lead_dependence).toBe(1);
  });

  it("credits every lead of a multi-lead round and splits its weight for the Herfindahl index", () => {
    const rounds = [
      toRound(round(1, COMPANIES.acme, { date: "2020-01", label: "SEED", standardized: "Seed", investors: [participant(LEAD_ONE, true), participant(LEAD_TWO, true), participant(INVESTOR, false)] })),
      toRound(round(2, COMPANIES.bramble, { date: "2020-02", label: "SEED", standardized: "Seed", investors: [participant(LEAD_ONE, true), participant(INVESTOR, false)] })),
    ];
    const { lead_partners } = syndicates(buildInvestmentHistory(fixtureDataset({ rounds })));
    expect(lead_partners.top.map((p) => [p.name, p.rounds, p.share])).toEqual([
      ["Northwind Capital", 2, 1],
      ["Blue Harbour Partners", 1, 0.5],
    ]);
    expect(lead_partners.herfindahl_index).toBe(0.625);
  });
});
