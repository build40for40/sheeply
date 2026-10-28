import { describe, expect, it } from "vitest";
import { ANGEL, COMPANIES, INVESTOR, participant, round } from "../../tests/fixtures/dealroom.ts";
import { fixtureDataset, toRound } from "../../tests/fixtures/dataset.ts";
import { buildInvestmentHistory } from "./investments.ts";

const byName = (history: ReturnType<typeof buildInvestmentHistory>, name: string) =>
  history.companies.find((company) => company.companyName === name)!;

describe("buildInvestmentHistory", () => {
  const history = buildInvestmentHistory(fixtureDataset());

  it("takes the earliest round the investor joined as its first observed investment", () => {
    const acme = byName(history, "Acme Robotics");
    expect(acme.initial?.id).toBe(11);
    expect(acme.followOns.map((r) => r.id)).toEqual([12]);
  });

  it("ignores company rounds the investor did not join", () => {
    expect(byName(history, "Acme Robotics").participations.map((r) => r.id)).not.toContain(13);
  });

  it("classifies portfolio rows without a usable round", () => {
    expect(byName(history, "Echo Labs").status).toBe("no_round_attribution");
    expect(byName(history, "Gamma AI").status).toBe("rounds_not_matched");
    expect(byName(history, "Foxtrot University").status).toBe("not_a_company");
    expect(byName(history, "Gamma AI").initial).toBeNull();
  });

  it("flags an initial round whose partial date overlaps the next participation", () => {
    const rounds = [
      toRound(round(1, COMPANIES.acme, { date: "2019-06", label: "SEED", standardized: "Seed", investors: [participant(INVESTOR, false)] })),
      toRound(round(2, COMPANIES.acme, { date: "2019", label: "PRE-SEED", standardized: "Pre-Seed", investors: [participant(INVESTOR, true)] })),
    ];
    const acme = byName(buildInvestmentHistory(fixtureDataset({ rounds })), "Acme Robotics");
    expect(acme.initial?.id).toBe(2);
    expect(acme.flags).toContain("initial_ordering_ambiguous");
  });

  it("sorts undated participations last and flags them", () => {
    const rounds = [
      toRound(round(1, COMPANIES.acme, { date: null, label: "SEED", standardized: "Seed", investors: [participant(INVESTOR, false)] })),
      toRound(round(2, COMPANIES.acme, { date: "2020-01", label: "SERIES A", standardized: "Series A", investors: [participant(INVESTOR, false), participant(ANGEL, true)] })),
    ];
    const acme = byName(buildInvestmentHistory(fixtureDataset({ rounds })), "Acme Robotics");
    expect(acme.initial?.id).toBe(2);
    expect(acme.flags).toEqual(["undated_participation"]);
  });
});
