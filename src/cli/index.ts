#!/usr/bin/env node
import { CommanderError } from "commander";
import { ConfigError, loadDotEnv } from "../config.ts";
import { DealroomApiError, DealroomSchemaError } from "../dealroom/client.ts";
import { InvestorResolutionError } from "../ingest/resolve.ts";
import { NoStoredDataError } from "../analysis/dataset.ts";
import { UsageError, describeCandidate } from "./analyse-command.ts";
import { buildProgram } from "./program.ts";

loadDotEnv();

const io = {
  env: process.env,
  stdout: (text: string) => process.stdout.write(text),
  stderr: (text: string) => process.stderr.write(text),
  isInteractive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
};

try {
  await buildProgram(io).parseAsync(process.argv);
} catch (error) {
  process.exitCode = exitCodeFor(error);
}

function exitCodeFor(error: unknown): number {
  if (error instanceof CommanderError) return error.exitCode;
  const message = error instanceof Error ? error.message : String(error);
  io.stderr(`sheeply: ${message}\n`);
  if (error instanceof InvestorResolutionError) {
    for (const candidate of error.candidates) io.stderr(`  ${describeCandidate(candidate)}\n`);
    return 2;
  }
  if (error instanceof UsageError || error instanceof ConfigError || error instanceof NoStoredDataError) return 2;
  if (error instanceof DealroomApiError || error instanceof DealroomSchemaError) return 3;
  if (error instanceof Error && error.stack && process.env.SHEEPLY_DEBUG) io.stderr(`${error.stack}\n`);
  return 1;
}
