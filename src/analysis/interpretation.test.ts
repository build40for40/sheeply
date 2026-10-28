import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../tests/fixtures/dataset.ts";
import { analyse } from "./analyse.ts";

describe("interpret", () => {
  const rules = analyse(fixtureDataset()).interpretation.map((s) => s.rule);

  it("declines to describe metrics below the minimum sample", () => {
    expect(rules).toEqual(expect.arrayContaining(["entry_maturity.insufficient_sample", "investment_leadership.insufficient_sample"]));
  });

  it("reports the lead-rate sensitivity and low coverage", () => {
    expect(rules).toEqual(expect.arrayContaining(["investment_leadership.sensitivity", "data_quality.lead_status_coverage"]));
  });

  it("never interprets the descriptive outputs", () => {
    expect(rules.some((rule) => rule.startsWith("sector") || rule.startsWith("syndicate"))).toBe(false);
  });
});
