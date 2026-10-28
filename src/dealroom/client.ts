import type { z } from "zod";
import type { DealroomConfig } from "../config.ts";
import { TOOL_NAME, TOOL_VERSION } from "../version.ts";
import { errorEnvelope } from "./schemas.ts";

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface ResponseMeta {
  endpoint: string;
  params: Record<string, string>;
  status: number;
  apiVersion: string | null;
  creditsUsed: number | null;
  retrievedAt: string;
  deprecation: string | null;
  sunset: string | null;
}

export interface DealroomResponse<T> {
  body: T;
  meta: ResponseMeta;
}

export class DealroomApiError extends Error {
  override name = "DealroomApiError";
  readonly status: number;
  readonly code: string;
  readonly endpoint: string;

  constructor(message: string, status: number, code: string, endpoint: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.endpoint = endpoint;
  }
}

export class DealroomSchemaError extends Error {
  override name = "DealroomSchemaError";
  readonly endpoint: string;
  readonly issues: string[];

  constructor(endpoint: string, issues: string[]) {
    super(`Unexpected response shape from ${endpoint}: ${issues.slice(0, 5).join("; ")}`);
    this.endpoint = endpoint;
    this.issues = issues;
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

const TOKEN_EXPIRY_SKEW_MS = 60_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class DealroomClient {
  readonly config: DealroomConfig;
  #fetch: typeof fetch;
  #sleep: (ms: number) => Promise<void>;
  #now: () => number;
  #log: (message: string) => void;
  #token: { value: string; expiresAt: number } | null = null;
  #nextSlot = 0;
  #requests = 0;
  #credits = 0;
  #warnedVersion = false;

  constructor(config: DealroomConfig, options: ClientOptions = {}) {
    this.config = config;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? (() => {});
  }

  get usage(): { requests: number; credits: number } {
    return { requests: this.#requests, credits: this.#credits };
  }

  async getValidated<S extends z.ZodType>(
    endpoint: string,
    params: QueryParams,
    schema: S,
  ): Promise<DealroomResponse<z.infer<S>> & { raw: unknown }> {
    const { body, meta } = await this.get(endpoint, params);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new DealroomSchemaError(
        endpoint,
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
      );
    }
    return { body: parsed.data, meta, raw: body };
  }

  async get(endpoint: string, params: QueryParams = {}): Promise<DealroomResponse<unknown>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const url = `${this.config.baseUrl}${endpoint}${query.size ? `?${query}` : ""}`;

    for (let attempt = 0; ; attempt++) {
      await this.#takeSlot();
      const token = await this.#getToken();
      let response: Response;
      try {
        this.#requests++;
        response = await this.#fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Client-Id": this.config.clientId,
            "API-Version": this.config.apiVersion,
            "User-Agent": `${TOOL_NAME}/${TOOL_VERSION}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
      } catch (cause) {
        if (attempt < this.config.maxRetries) {
          const wait = this.#backoff(attempt);
          this.#log(`network error on ${endpoint} (${describe(cause)}), retrying in ${wait}ms`);
          await this.#sleep(wait);
          continue;
        }
        throw new DealroomApiError(`Network failure on ${endpoint}: ${describe(cause)}`, 0, "NETWORK_ERROR", endpoint);
      }

      const credits = Number(response.headers.get("X-Credits-Used"));
      if (Number.isFinite(credits)) this.#credits += credits;

      if (response.ok) {
        const text = await response.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          if (attempt < this.config.maxRetries) {
            await this.#sleep(this.#backoff(attempt));
            continue;
          }
          throw new DealroomApiError(`Non-JSON 200 response from ${endpoint}`, response.status, "INVALID_BODY", endpoint);
        }
        const meta: ResponseMeta = {
          endpoint,
          params: Object.fromEntries(query.entries()),
          status: response.status,
          apiVersion: response.headers.get("API-Version"),
          creditsUsed: Number.isFinite(credits) ? credits : null,
          retrievedAt: new Date(this.#now()).toISOString(),
          deprecation: response.headers.get("Deprecation"),
          sunset: response.headers.get("Sunset"),
        };
        if (meta.sunset && !this.#warnedVersion) {
          this.#warnedVersion = true;
          this.#log(`API version ${this.config.apiVersion} is deprecated and sunsets on ${meta.sunset}`);
        }
        return { body, meta };
      }

      const text = await response.text();
      const code = parseErrorCode(text);

      if (response.status === 401 && attempt === 0) {
        this.#token = null;
        continue;
      }
      if (RETRYABLE_STATUS.has(response.status) && attempt < this.config.maxRetries) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.#backoff(attempt);
        this.#log(`${response.status} ${code} on ${endpoint}, retrying in ${wait}ms`);
        await this.#sleep(wait);
        continue;
      }
      throw new DealroomApiError(explain(response.status, code, endpoint, text), response.status, code, endpoint);
    }
  }

  #backoff(attempt: number): number {
    return Math.min(30_000, 500 * 2 ** attempt);
  }

  async #takeSlot(): Promise<void> {
    const interval = Math.ceil(1000 / this.config.requestsPerSecond);
    const now = this.#now();
    const slot = Math.max(now, this.#nextSlot);
    this.#nextSlot = slot + interval;
    if (slot > now) await this.#sleep(slot - now);
  }

  async #getToken(): Promise<string> {
    if (this.#token && this.#token.expiresAt > this.#now()) return this.#token.value;

    let response: Response;
    try {
      response = await this.#fetch(this.config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": `${TOOL_NAME}/${TOOL_VERSION}` },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          audience: this.config.audience,
          grant_type: "client_credentials",
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (cause) {
      throw new DealroomApiError(`Token exchange failed: ${describe(cause)}`, 0, "NETWORK_ERROR", "oauth/token");
    }
    if (!response.ok) {
      const hint =
        response.status === 403
          ? ` The key was refused for audience ${this.config.audience}. Keys issued for the beta host need DEALROOM_API_BASE_URL=https://api.beta.dealroom.app.`
          : "";
      throw new DealroomApiError(`Token exchange failed with ${response.status}.${hint}`, response.status, "AUTH_FAILED", "oauth/token");
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new DealroomApiError("Token exchange returned no access_token", 200, "AUTH_FAILED", "oauth/token");
    this.#token = {
      value: body.access_token,
      expiresAt: this.#now() + (body.expires_in ?? 3600) * 1000 - TOKEN_EXPIRY_SKEW_MS,
    };
    return body.access_token;
  }
}

function parseErrorCode(text: string): string {
  try {
    const parsed = errorEnvelope.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.error.code : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function explain(status: number, code: string, endpoint: string, text: string): string {
  const detail = text.trimStart().startsWith("<") ? "(HTML error page)" : text.slice(0, 300);
  if (status === 402) return `Dealroom credits are exhausted (402 ${code}) on ${endpoint}. Add credits before retrying.`;
  if (status === 403) return `Dealroom refused ${endpoint} (403 ${code}): the API key lacks access. ${detail}`;
  if (status === 404) return `Not found on Dealroom: ${endpoint} (404 ${code})`;
  return `${status} ${code} on ${endpoint}: ${detail}`;
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.name === "TimeoutError" ? "timed out" : cause.message;
  return String(cause);
}
