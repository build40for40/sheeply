import { describe, expect, it } from "vitest";
import { loadDealroomConfig, loadDotEnv } from "../../src/config.ts";
import { DealroomClient } from "../../src/dealroom/client.ts";
import { searchInvestors } from "../../src/dealroom/endpoints.ts";
import { investorDetailResponse, portfolioResponse, transactionsResponse } from "../../src/dealroom/schemas.ts";

loadDotEnv();
const hasCredentials = Boolean(process.env.DEALROOM_CLIENT_ID && process.env.DEALROOM_CLIENT_SECRET);
const query = process.env.SHEEPLY_SMOKE_INVESTOR ?? "Seedcamp";

/** Checks the live API still matches the schemas Sheeply validates against. Costs about a dozen credits. */
describe.skipIf(!hasCredentials)("live Dealroom API", () => {
  const client = () => new DealroomClient(loadDealroomConfig(), { log: (m) => console.warn(m) });

  it("resolves an investor and serves every response shape the ingestion reads", async () => {
    const c = client();
    const { body: search } = await searchInvestors(c, query);
    const hit = search.data.find((h) => h.type === "investor");
    expect(hit, `no investor found for ${query}`).toBeDefined();

    const detail = await c.getValidated(`/data/investors/${hit!.uuid}`, {}, investorDetailResponse);
    expect(detail.meta.apiVersion).toBe(c.config.apiVersion);

    const portfolio = await c.getValidated(`/data/investors/${hit!.uuid}/portfolio`, { limit: 3 }, portfolioResponse);
    expect(portfolio.body.data.length).toBeGreaterThan(0);

    const rounds = await c.getValidated(
      "/data/transactions",
      { filter: `company_investor_id[in_any]:${hit!.uuid}`, sort: "date", limit: 3 },
      transactionsResponse,
    );
    expect(rounds.body.page.tier ?? "premium").toBe("premium");
    expect(rounds.body.data.every((round) => round.investors !== null)).toBe(true);
  });
});
