import type { DealroomConfig } from "../../src/config.ts";
import { INVESTOR, INVESTOR_DETAIL, PORTFOLIO, SEARCH_HITS, TRANSACTIONS, companyRounds } from "./dealroom.ts";

export const TEST_CONFIG: DealroomConfig = {
  clientId: "test-client",
  clientSecret: "test-secret",
  baseUrl: "https://dealroom.test",
  audience: "https://dealroom.test",
  tokenUrl: "https://auth.dealroom.test/oauth/token",
  apiVersion: "2026-10-22",
  requestsPerSecond: 1000,
  timeoutMs: 1000,
  maxRetries: 3,
};

export const TEST_ENV = {
  DEALROOM_CLIENT_ID: TEST_CONFIG.clientId,
  DEALROOM_CLIENT_SECRET: TEST_CONFIG.clientSecret,
  DEALROOM_API_BASE_URL: TEST_CONFIG.baseUrl,
  DEALROOM_TOKEN_URL: TEST_CONFIG.tokenUrl,
  DEALROOM_REQUESTS_PER_SECOND: "1000",
};

export interface Scripted {
  /** Matched against `pathname?search` of the request. */
  match: RegExp;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** How many matching requests get this response before falling through. */
  times?: number;
}

export interface FakeApiOptions {
  pageSize?: number;
  transactions?: unknown[];
  portfolio?: unknown[];
  scripted?: Scripted[];
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Credits-Used": "1", ...headers } });

const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
const decodeCursor = (cursor: string) => (JSON.parse(Buffer.from(cursor, "base64url").toString()) as { o: number }).o;

/** An in-memory Dealroom: serves the fixture world with cursor pagination and scripted failures. */
export function fakeDealroom(options: FakeApiOptions = {}) {
  const pageSize = options.pageSize ?? 3;
  const transactions = options.transactions ?? TRANSACTIONS;
  const portfolio = options.portfolio ?? PORTFOLIO;
  const scripted = (options.scripted ?? []).map((s) => ({ ...s, remaining: s.times ?? Infinity }));
  const calls: string[] = [];

  const paged = (rows: unknown[], url: URL, extra: Record<string, unknown> = {}) => {
    const cursor = url.searchParams.get("cursor");
    const offset = cursor ? decodeCursor(cursor) : 0;
    const data = rows.slice(offset, offset + pageSize);
    const next = offset + pageSize < rows.length ? encodeCursor(offset + pageSize) : null;
    const total = url.searchParams.get("include_total") === "true" ? rows.length : undefined;
    return json({
      data,
      page: { total, limit: pageSize, offset, next_cursor: next, prev_cursor: null, tier: "premium" },
      currency: "USD",
      ...extra,
    });
  };

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const target = `${url.pathname}${url.search}`;
    calls.push(`${init?.method ?? "GET"} ${url.host}${target}`);

    const script = scripted.find((s) => s.remaining > 0 && s.match.test(target));
    if (script) {
      script.remaining--;
      return json(script.body ?? { error: { code: "SCRIPTED", message: "scripted" } }, script.status, script.headers);
    }

    if (url.pathname === "/oauth/token") return json({ access_token: "token", token_type: "Bearer", expires_in: 86400 });
    if (url.pathname === "/data/search") return json({ data: SEARCH_HITS });
    if (url.pathname === `/data/investors/${INVESTOR.uuid}`) return json(INVESTOR_DETAIL);
    if (url.pathname === `/data/investors/${INVESTOR.uuid}/portfolio`) return paged(portfolio, url);
    if (url.pathname === "/data/transactions") {
      if (url.searchParams.get("filter") !== `company_investor_id[in_any]:${INVESTOR.uuid}`) return json({ data: [], page: {} });
      return paged(transactions, url);
    }
    const rounds = url.pathname.match(/^\/data\/companies\/([^/]+)\/funding-rounds$/);
    if (rounds) return paged(companyRounds(rounds[1]!), url);
    return json({ error: { code: "NOT_FOUND", message: `no fake for ${target}` } }, 404);
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    apiCalls: () => calls.filter((call) => !call.includes("/oauth/token")),
  };
}

export const noSleep = async () => {};
