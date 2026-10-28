import { describe, expect, it } from "vitest";
import { z } from "zod";
import { INVESTOR } from "../../tests/fixtures/dealroom.ts";
import { TEST_CONFIG, fakeDealroom, noSleep } from "../../tests/fixtures/fake-api.ts";
import { DealroomApiError, DealroomClient, DealroomSchemaError } from "./client.ts";

const client = (api: ReturnType<typeof fakeDealroom>, sleeps: number[] = []) =>
  new DealroomClient(TEST_CONFIG, {
    fetch: api.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

describe("DealroomClient", () => {
  it("sends the bearer token, client id and pinned API version", async () => {
    const seen: Headers[] = [];
    const api = fakeDealroom();
    const spy: typeof fetch = async (input, init) => {
      seen.push(new Headers(init?.headers));
      return api.fetch(input, init);
    };
    await new DealroomClient(TEST_CONFIG, { fetch: spy, sleep: noSleep }).get(`/data/investors/${INVESTOR.uuid}`);
    const headers = seen.at(-1)!;
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Client-Id")).toBe("test-client");
    expect(headers.get("API-Version")).toBe("2026-10-22");
  });

  it("honours Retry-After on 429 and retries 5xx", async () => {
    const sleeps: number[] = [];
    const api = fakeDealroom({
      scripted: [
        { match: /investors/, status: 429, headers: { "Retry-After": "2" }, times: 1 },
        { match: /investors/, status: 504, times: 1 },
      ],
    });
    const response = await client(api, sleeps).get(`/data/investors/${INVESTOR.uuid}`);
    expect(response.meta.status).toBe(200);
    expect(sleeps).toContain(2000);
    expect(api.apiCalls()).toHaveLength(3);
  });

  it("re-mints the token once on 401", async () => {
    const api = fakeDealroom({ scripted: [{ match: /investors/, status: 401, times: 1 }] });
    await client(api).get(`/data/investors/${INVESTOR.uuid}`);
    expect(api.calls.filter((c) => c.includes("oauth/token"))).toHaveLength(2);
  });

  it("does not retry exhausted credits or missing entitlements", async () => {
    const api = fakeDealroom({ scripted: [{ match: /investors/, status: 402, body: { error: { code: "CREDITS_EXHAUSTED", message: "x" } } }] });
    await expect(client(api).get(`/data/investors/${INVESTOR.uuid}`)).rejects.toMatchObject({ status: 402, code: "CREDITS_EXHAUSTED" });
    expect(api.apiCalls()).toHaveLength(1);
  });

  it("gives up after the retry budget", async () => {
    const api = fakeDealroom({ scripted: [{ match: /investors/, status: 503 }] });
    await expect(client(api).get(`/data/investors/${INVESTOR.uuid}`)).rejects.toBeInstanceOf(DealroomApiError);
    expect(api.apiCalls()).toHaveLength(TEST_CONFIG.maxRetries + 1);
  });

  it("rejects responses missing fields the analysis depends on", async () => {
    const api = fakeDealroom({ scripted: [{ match: /investors/, status: 200, body: { data: { uuid: "x" } } }] });
    const schema = z.object({ data: z.object({ uuid: z.string(), name: z.string() }) });
    await expect(client(api).getValidated(`/data/investors/${INVESTOR.uuid}`, {}, schema)).rejects.toBeInstanceOf(DealroomSchemaError);
  });

  it("tracks requests and credits", async () => {
    const api = fakeDealroom();
    const c = client(api);
    await c.get(`/data/investors/${INVESTOR.uuid}`);
    await c.get("/data/search", { q: "x" });
    expect(c.usage).toEqual({ requests: 2, credits: 2 });
  });
});
