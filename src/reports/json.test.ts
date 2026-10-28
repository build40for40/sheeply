import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { analyse } from "../analysis/analyse.ts";
import { blackSheepScore, calibrate, sheepProfile } from "../analysis/black-sheep.ts";
import { buildReport, datasetFingerprint, renderJson } from "./json.ts";

const render = (verbose = false) => {
  const dataset = fixtureDataset();
  const analysis = analyse(dataset);
  const profile = sheepProfile(analysis.history, analysis.entryMaturity, dataset.investor.name);
  const blackSheep = blackSheepScore(profile, calibrate([], "test", "test"));
  return renderJson(buildReport(dataset, analysis, blackSheep, { verbose }));
};

describe("JSON report", () => {
  it("renders byte-identical output for the same dataset", () => {
    expect(render()).toBe(render());
  });

  it("fingerprints the records, not the retrieval metadata", () => {
    const a = fixtureDataset();
    const b = { ...fixtureDataset(), provenance: { ...a.provenance, runId: 99 } };
    expect(datasetFingerprint(a)).toBe(datasetFingerprint(b));
    expect(datasetFingerprint(a)).not.toBe(datasetFingerprint(fixtureDataset({ rounds: a.rounds.slice(1) })));
  });

  it("lists the investments behind each metric only in verbose mode", () => {
    expect(JSON.parse(render()).contributions).toBeUndefined();
    const contributions = JSON.parse(render(true)).contributions;
    expect(contributions).toHaveLength(8);
    expect(contributions.find((c: { company_name: string }) => c.company_name === "Bramble Health")).toMatchObject({
      initial_round: { round_id: 21, stage_bucket: "seed", lead_status: "not_led", leads: [{ name: "Northwind Capital" }] },
      follow_on_rounds: [{ round_id: 22 }],
    });
  });

  it("keeps the metrics and descriptive outputs separate from the peer-ranked score", () => {
    const report = JSON.parse(render());
    expect(report.entry_maturity.role).toBe("metric");
    expect(report.investment_leadership.role).toBe("metric");
    expect(report.sector_exposure.role).toBe("descriptive");
    expect(report.syndicate_relationships.role).toBe("descriptive");
    expect(report.black_sheep_score).toMatchObject({ role: "score", status: "not_scored", value: null });
    expect(Object.keys(report).filter((key) => key.includes("score"))).toEqual(["black_sheep_score"]);
  });

  it("carries versions and sample sizes", () => {
    const report = JSON.parse(render());
    expect(report.tool).toMatchObject({ name: "sheeply", algorithm_version: expect.any(String), extraction_version: "1" });
    expect(report.coverage).toMatchObject({ first_investments_identified: 5, first_investments_with_known_stage: 3 });
  });
});
