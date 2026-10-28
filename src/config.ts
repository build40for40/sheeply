import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export interface DealroomConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  audience: string;
  tokenUrl: string;
  apiVersion: string;
  requestsPerSecond: number;
  timeoutMs: number;
  maxRetries: number;
}

export const DEALROOM_DEFAULTS = {
  baseUrl: "https://api.dealroom.app",
  tokenUrl: "https://accounts.dealroom.co/oauth/token",
  apiVersion: "2026-10-22",
  requestsPerSecond: 4,
  timeoutMs: 60_000,
  maxRetries: 5,
} as const;

export const DEFAULT_DB_PATH = "sheeply.sqlite";

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Fills unset variables from `.env` in the working directory; real environment values always win. */
export function loadDotEnv(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  const file = resolve(cwd, ".env");
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (env[key] === undefined || env[key] === "") env[key] = value;
  }
}

const positiveNumber = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new ConfigError(`${name} must be a positive number, got "${raw}"`);
  return value;
};

export function loadDealroomConfig(env: NodeJS.ProcessEnv = process.env): DealroomConfig {
  const clientId = env.DEALROOM_CLIENT_ID ?? "";
  const clientSecret = env.DEALROOM_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    throw new ConfigError(
      "DEALROOM_CLIENT_ID and DEALROOM_CLIENT_SECRET are required to fetch from Dealroom. " +
        "Copy .env.example to .env and fill them in, or rerun with --offline to use stored data.",
    );
  }
  const baseUrl = (env.DEALROOM_API_BASE_URL || DEALROOM_DEFAULTS.baseUrl).replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    baseUrl,
    audience: env.DEALROOM_AUDIENCE || baseUrl,
    tokenUrl: env.DEALROOM_TOKEN_URL || DEALROOM_DEFAULTS.tokenUrl,
    apiVersion: env.DEALROOM_API_VERSION || DEALROOM_DEFAULTS.apiVersion,
    requestsPerSecond: positiveNumber(
      env.DEALROOM_REQUESTS_PER_SECOND,
      DEALROOM_DEFAULTS.requestsPerSecond,
      "DEALROOM_REQUESTS_PER_SECOND",
    ),
    timeoutMs: positiveNumber(env.DEALROOM_TIMEOUT_MS, DEALROOM_DEFAULTS.timeoutMs, "DEALROOM_TIMEOUT_MS"),
    maxRetries: DEALROOM_DEFAULTS.maxRetries,
  };
}
