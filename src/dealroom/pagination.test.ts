import { describe, expect, it } from "vitest";
import { INVESTOR, TRANSACTIONS } from "../../tests/fixtures/dealroom.ts";
import { TEST_CONFIG, fakeDealroom, noSleep } from "../../tests/fixtures/fake-api.ts";
import { DealroomClient } from "./client.ts";
import { portfolioTransactionPages } from "./endpoints.ts";
import { walkPages } from "./pagination.ts";
import { transactionsResponse } from "./schemas.ts";

describe("walkPages", () => {
  it("follows next_cursor to the end and resends filter and sort with each cursor", async () => {
    const api = fakeDealroom({ pageSize: 4 });
    const client = new DealroomClient(TEST_CONFIG, { fetch: api.fetch, sleep: noSleep });
    const ids: number[] = [];
    for await (const page of portfolioTransactionPages(client, INVESTOR.uuid)) ids.push(...page.body.data.map((r) => r.id));

    expect(ids).toEqual(TRANSACTIONS.map((r) => r.id));
    const calls = api.apiCalls();
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("cursor=");
    expect(calls[1]).toContain("filter=company_investor_id");
    expect(calls[1]).toContain("sort=date");
    expect(calls[1]).not.toContain("limit=");
  });

  it("fails loudly when the API repeats a cursor", async () => {
    const api = fakeDealroom({
      scripted: [{ match: /transactions/, status: 200, body: { data: [TRANSACTIONS[0]], page: { next_cursor: "same" } } }],
    });
    const client = new DealroomClient(TEST_CONFIG, { fetch: api.fetch, sleep: noSleep });
    const walk = async () => {
      for await (const _page of walkPages(client, "/data/transactions", {}, transactionsResponse));
    };
    await expect(walk()).rejects.toMatchObject({ code: "PAGINATION_LOOP" });
  });
});
