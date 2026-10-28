import { Command, Option } from "commander";
import { DEFAULT_DB_PATH } from "../config.ts";
import { TOOL_VERSION } from "../version.ts";
import type { CliIo } from "./analyse-command.ts";
import { SUPPORTED_FORMATS, runAnalyse } from "./analyse-command.ts";
import { runRebuild, runStatus } from "./db-command.ts";

export function buildProgram(io: CliIo): Command {
  const dbDefault = io.env.SHEEPLY_DB || DEFAULT_DB_PATH;
  const dbOption = () => new Option("--db <path>", "SQLite cache file, created if missing").default(dbDefault);

  const program = new Command()
    .name("sheeply")
    .description("Profile how a venture firm invests (entry stage, lead behaviour, syndicates) from Dealroom data.")
    .version(TOOL_VERSION)
    .enablePositionalOptions()
    .argument("[investor]", "investor name to resolve on Dealroom")
    .option("--investor-id <uuid>", "Dealroom investor UUID, skips name resolution")
    .addOption(dbOption())
    .option("--refresh", "fetch from Dealroom again even if data is stored", false)
    .option("--offline", "use only stored data, never call Dealroom", false)
    .addOption(new Option("--format <format>", "output format").choices(SUPPORTED_FORMATS).default("sheep"))
    .option("--output <file>", "write the report to a file instead of stdout")
    .option("--verbose", "include the per-company investments behind every metric (json format)", false)
    .option("--no-interactive", "fail instead of prompting when a name is ambiguous")
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .exitOverride()
    .action(async (investor: string | undefined, options) => {
      await runAnalyse({ ...options, investor }, io);
    });

  const db = program.command("db").description("Manage the local SQLite cache");
  db.command("rebuild")
    .description("Drop and re-derive every table from the stored Dealroom responses (no API calls)")
    .addOption(dbOption())
    .action((options) => runRebuild(options.db, io));
  db.command("status")
    .description("List stored investors and ingestion runs")
    .addOption(dbOption())
    .action((options) => runStatus(options.db, io));

  return program;
}
