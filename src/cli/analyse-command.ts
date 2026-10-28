import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { analyse } from "../analysis/analyse.ts";
import type { BlackSheepScore } from "../analysis/black-sheep.ts";
import { blackSheepScore, sheepProfile } from "../analysis/black-sheep.ts";
import { CALIBRATION } from "../analysis/black-sheep-calibration.ts";
import { latestCompleteRun, loadDataset } from "../analysis/dataset.ts";
import { loadDealroomConfig } from "../config.ts";
import { DealroomClient } from "../dealroom/client.ts";
import type { Database } from "../db/database.ts";
import { extractionIsStale, openDatabase } from "../db/database.ts";
import { rebuildDerivedTables } from "../ingest/extract.ts";
import { ingestInvestor } from "../ingest/fetch.ts";
import type { Candidate, Chooser } from "../ingest/resolve.ts";
import { resolveInvestor } from "../ingest/resolve.ts";
import { buildReport, renderJson } from "../reports/json.ts";
import { renderBlackSheep } from "../reports/sheep.ts";

export interface AnalyseOptions {
  investor?: string;
  investorId?: string;
  db: string;
  refresh: boolean;
  offline: boolean;
  format: string;
  output?: string;
  verbose: boolean;
  interactive: boolean;
}

export interface CliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  isInteractive: boolean;
}

export class UsageError extends Error {
  override name = "UsageError";
}

export const SUPPORTED_FORMATS = ["sheep", "json"];

export function openWorkingDatabase(path: string, log: (message: string) => void): Database {
  const db = openDatabase(path);
  if (extractionIsStale(db)) {
    log("Stored tables come from an older extraction version; rebuilding them from stored responses");
    rebuildDerivedTables(db);
  }
  return db;
}

export async function runAnalyse(options: AnalyseOptions, io: CliIo): Promise<void> {
  if (options.offline && options.refresh) throw new UsageError("--offline and --refresh cannot be combined.");
  if (!SUPPORTED_FORMATS.includes(options.format)) {
    throw new UsageError(`Unsupported --format "${options.format}". Supported: ${SUPPORTED_FORMATS.join(", ")}.`);
  }
  if (!options.investor && !options.investorId) throw new UsageError("Give an investor name or --investor-id <uuid>.");

  const log = (message: string) => io.stderr(`${message}\n`);
  const db = openWorkingDatabase(options.db, log);
  try {
    let client: DealroomClient | undefined;
    const getClient = () =>
      (client ??= new DealroomClient(loadDealroomConfig(io.env), { fetch: io.fetch, sleep: io.sleep, log }));

    const resolution = await resolveInvestor({
      db,
      query: options.investor,
      investorId: options.investorId,
      offline: options.offline,
      client: getClient,
      choose: options.interactive && io.isInteractive ? promptChoice(log) : undefined,
    });

    const stored = latestCompleteRun(db, resolution.id);
    if (options.offline) {
      log(`Using stored data for ${resolution.name} (offline)`);
    } else if (stored === null || options.refresh) {
      log(`${stored === null ? "Fetching" : "Refreshing"} ${resolution.name} (${resolution.id}) from Dealroom`);
      await ingestInvestor(db, getClient(), resolution.id, { log });
      const usage = getClient().usage;
      log(`Fetched with ${usage.requests} requests, ${usage.credits} Dealroom credits`);
    } else {
      log(`Using stored data for ${resolution.name} from run ${stored}; pass --refresh to fetch again`);
    }

    const dataset = loadDataset(db, resolution.id);
    const analysis = analyse(dataset);
    const blackSheep = blackSheepScore(sheepProfile(analysis.history, analysis.entryMaturity, dataset.investor.name), CALIBRATION);
    const text =
      options.format === "json"
        ? renderJson(buildReport(dataset, analysis, blackSheep, { verbose: options.verbose }))
        : renderBlackSheep(dataset.investor.name, scoredValue(dataset.investor.name, blackSheep));
    if (options.output) {
      const path = resolve(options.output);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      log(`Wrote ${path}`);
    } else {
      io.stdout(text);
    }
  } finally {
    db.close();
  }
}

function scoredValue(name: string, score: BlackSheepScore): number {
  if (score.value === null) {
    throw new UsageError(`No black sheep score for ${name}. ${score.reasons.join(" ")} Use --format json for the full report.`);
  }
  return score.value;
}

function promptChoice(log: (message: string) => void): Chooser {
  return async (query: string, candidates: Candidate[]) => {
    log(`"${query}" matches several investors:`);
    candidates.forEach((candidate, index) => log(`  ${index + 1}. ${describeCandidate(candidate)}`));
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const answer = (await rl.question(`Choose 1-${candidates.length} (anything else cancels): `)).trim();
      const index = Number(answer);
      return Number.isInteger(index) && index >= 1 && index <= candidates.length ? candidates[index - 1]! : null;
    } finally {
      rl.close();
    }
  };
}

export function describeCandidate(candidate: Candidate): string {
  const details = [candidate.domain, candidate.location].filter(Boolean).join(", ");
  return `${candidate.name}${details ? ` (${details})` : ""}  --investor-id ${candidate.id}`;
}
