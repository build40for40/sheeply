import { describe, expect, it } from "vitest";
import { INVESTOR } from "../../tests/fixtures/dealroom.ts";
import { TEST_CONFIG, fakeDealroom, noSleep } from "../../tests/fixtures/fake-api.ts";
import { DealroomClient } from "../dealroom/client.ts";
import { openDatabase } from "../db/database.ts";
import { InvestorResolutionError, matchCandidates, resolveInvestor } from "./resolve.ts";

const candidate = (id: string, name: string) => ({ id, name, location: null, domain: null, rank: null });

describe("matchCandidates", () => {
  it("picks a single exact match regardless of case and punctuation", () => {
    const result = matchCandidates("local globe", [candidate("1", "LocalGlobe"), candidate("2", "Local Globe Fund")]);
    expect(result).toEqual({ match: candidate("1", "LocalGlobe") });
  });

  it("never picks a fuzzy match automatically", () => {
    expect(matchCandidates("Example", [candidate("1", "Example Ventures")])).toEqual({ ambiguous: [candidate("1", "Example Ventures")] });
  });

  it("treats several exact matches as ambiguous", () => {
    const result = matchCandidates("Sample Capital", [candidate("1", "Sample Capital"), candidate("2", "Sample Capital"), candidate("3", "Other")]);
    expect(result).toEqual({ ambiguous: [candidate("1", "Sample Capital"), candidate("2", "Sample Capital")] });
  });
});

describe("resolveInvestor", () => {
  const setup = () => {
    const api = fakeDealroom();
    return { db: openDatabase(":memory:"), client: () => new DealroomClient(TEST_CONFIG, { fetch: api.fetch, sleep: noSleep }) };
  };

  it("resolves an exact name through Dealroom search", async () => {
    const { db, client } = setup();
    await expect(resolveInvestor({ db, query: "example ventures", offline: false, client })).resolves.toEqual({
      id: INVESTOR.uuid,
      name: "Example Ventures",
      via: "search_exact_name",
    });
  });

  it("fails deterministically with the candidates when ambiguous and no chooser is given", async () => {
    const { db, client } = setup();
    const error = await resolveInvestor({ db, query: "Sample Capital", offline: false, client }).catch((e) => e);
    expect(error).toBeInstanceOf(InvestorResolutionError);
    expect(error.candidates.map((c: { name: string }) => c.name)).toEqual(["Sample Capital", "Sample Capital"]);
  });

  it("lets an interactive chooser settle ambiguity", async () => {
    const { db, client } = setup();
    const resolution = await resolveInvestor({ db, query: "Sample Capital", offline: false, client, choose: async (_q, c) => c[1]! });
    expect(resolution.via).toBe("interactive_choice");
  });

  it("refuses an unknown name offline", async () => {
    const { db } = setup();
    await expect(resolveInvestor({ db, query: "Nobody", offline: true })).rejects.toBeInstanceOf(InvestorResolutionError);
  });
});
