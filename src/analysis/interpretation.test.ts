import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { analyse } from "./analyse.ts";

describe("interpret", () => {
  it("declines to describe metrics below the minimum sample", () => {
    const rules = analyse(fixtureDataset()).interpretation.map((s) => s.rule);
    expect(rules).toEqual(
      expect.arrayContaining(["entry_stage.insufficient_sample", "leadership.insufficient_sample", "syndicates.insufficient_sample"]),
    );
  });

  it("calls out low lead-status coverage", () => {
    const rules = analyse(fixtureDataset()).interpretation.map((s) => s.rule);
    expect(rules).toContain("data_quality.lead_status_coverage");
  });
});
