import { describe, expect, it } from "vitest";
import { fixtureDataset, toRound } from "../../tests/fixtures/dataset.ts";
import { TRANSACTIONS } from "../../tests/fixtures/dealroom.ts";
import type { SheepObservation, SheepProfile } from "./black-sheep.ts";
import { blackSheepScore, calibrate, sheepProfile } from "./black-sheep.ts";
import { entryMaturity } from "./entry-maturity.ts";
import { buildInvestmentHistory } from "./investments.ts";
import type { Dataset } from "./types.ts";

const profileOf = (dataset: Dataset) => {
  const history = buildInvestmentHistory(dataset);
  return sheepProfile(history, entryMaturity(history), dataset.investor.name);
};

const repeat = (count: number, observation: SheepObservation) => Array.from({ length: count }, () => observation);

/** 20 early entries plus 20 late ones; `followsEarly` and `followsLate` of each follow another lead. */
function profile(id: string, followsEarly: number, followsLate: number, earlyStageShare = 0.9): SheepProfile {
  return {
    investorId: id,
    name: id,
    earlyStageShare,
    observations: [
      ...repeat(followsEarly, { late: false, led: false, soleInvestor: false }),
      ...repeat(20 - followsEarly, { late: false, led: true, soleInvestor: false }),
      ...repeat(followsLate, { late: true, led: false, soleInvestor: false }),
      ...repeat(20 - followsLate, { late: true, led: true, soleInvestor: false }),
    ],
  };
}

const peers = [...Array.from({ length: 11 }, (_, i) => profile(`peer-${i}`, 5 + i, 5 + i)), profile("peer-4b", 9, 9)];
const CALIBRATION = calibrate(peers, "test", "test");

describe("sheep profile", () => {
  it("keeps first investments since 2020 and reads their lead status and entry position", () => {
    expect(profileOf(fixtureDataset()).observations).toEqual([
      { late: false, led: null, soleInvestor: false },
      { late: false, led: true, soleInvestor: false },
    ]);
  });

  it("counts the only disclosed investor as the lead, even without a lead flag", () => {
    const rounds = TRANSACTIONS.map(toRound).map((round) => (round.id === 41 ? { ...round, announcedDate: "2021" } : round));
    expect(profileOf(fixtureDataset({ rounds })).observations).toContainEqual({ late: false, led: true, soleInvestor: true });
  });
});

describe("black sheep score", () => {
  it("scores 100 when the investor follows less often than every peer, and 0 when more often", () => {
    expect(blackSheepScore(profile("bold", 0, 0), CALIBRATION)).toMatchObject({
      status: "scored",
      value: 100,
      components: { leads: { score: 100, peers: 12 }, independent_entry: { score: 100, peers: 12 } },
    });
    expect(blackSheepScore(profile("flock", 20, 20), CALIBRATION).value).toBe(0);
  });

  it("averages the two components and counts ties as half", () => {
    const score = blackSheepScore(profile("mixed", 0, 18), CALIBRATION);
    expect(score.components.leads.score).toBe(59);
    expect(score.components.independent_entry.score).toBe(0);
    expect(score.value).toBe(30);
  });

  it("keeps the raw counts behind each component", () => {
    const { components } = blackSheepScore(profile("counts", 4, 10), CALIBRATION);
    expect(components.leads.follows_others).toEqual({ numerator: 14, denominator: 40, value: 0.35 });
    expect(components.independent_entry.late_entry).toEqual({ numerator: 20, denominator: 40, value: 0.5 });
    expect(components.independent_entry.follows_others_when_late).toEqual({ numerator: 10, denominator: 20, value: 0.5 });
    expect(components.independent_entry.late_follow_share).toBe(0.25);
  });

  it("gives a reproducible range around the score", () => {
    const a = blackSheepScore(profile("range", 8, 8), CALIBRATION);
    expect(a.range).toEqual(blackSheepScore(profile("range", 8, 8), CALIBRATION).range);
    expect(a.range!.low).toBeLessThanOrEqual(a.value!);
    expect(a.range!.high).toBeGreaterThanOrEqual(a.value!);
  });

  it("does not rank a peer against its own share", () => {
    const self = profile("peer-0", 5, 5);
    expect(blackSheepScore(self, CALIBRATION).components.leads.peers).toBe(11);
  });

  it("explains why it does not score", () => {
    expect(blackSheepScore(profile("late-stage", 5, 5, 0.2), CALIBRATION).reasons[0]).toContain("after seed");
    expect(blackSheepScore(profile("alone", 5, 5), calibrate(peers.slice(0, 3), "test", "test"))).toMatchObject({
      status: "not_scored",
      value: null,
      range: null,
      reasons: [expect.stringContaining("too few peers")],
    });
    const small = { ...profile("small", 0, 0), observations: profile("small", 0, 0).observations.slice(0, 25) };
    expect(blackSheepScore(small, CALIBRATION).reasons).toEqual([expect.stringContaining("Only 5 first investments since 2020 joined")]);
  });

  it("calibrates only from early-stage peers with enough data, without names or ids", () => {
    const mixed = [...peers, profile("growth", 0, 0, 0.1), { ...profile("thin", 0, 0), observations: [] }];
    const calibration = calibrate(mixed, "v1", "0.0.0");
    expect(calibration.leads).toEqual(CALIBRATION.leads);
    expect(calibration.leads[0]).toBe(0.25);
    expect(JSON.stringify(calibration)).not.toContain("peer-");
  });
});
