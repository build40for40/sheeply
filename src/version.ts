import { readFileSync } from "node:fs";

export const TOOL_NAME = "sheeply";
export const TOOL_VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** Bump when the raw-response to table mapping changes; `sheeply db rebuild` re-derives tables. */
export const EXTRACTION_VERSION = "1";

/** Bump when any metric, threshold or interpretation rule changes. */
export const ALGORITHM_VERSION = "0.3.0";

/** Bump when the JSON report shape changes incompatibly. */
export const REPORT_SCHEMA_VERSION = "2";
