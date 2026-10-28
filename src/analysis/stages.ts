export const STAGE_BUCKETS = ["pre_seed", "seed", "series_a", "series_b_plus"] as const;
export type StageBucket = (typeof STAGE_BUCKETS)[number];

/** Dealroom returns `round_label` as e.g. "MICRO-SEED" or "SERIES A EXTENSION"; reference data spells it "Micro-Seed". */
export function normaliseLabel(label: string): string {
  return label
    .toUpperCase()
    .replace(/[^A-Z0-9+]+/g, " ")
    .trim();
}

/**
 * Maps Dealroom's own stage label to an entry-maturity bucket. Labels outside the documented
 * Pre-Seed to Series F ladder return null so they are reported as unmapped, not guessed.
 */
export function stageBucket(roundLabel: string | null): StageBucket | null {
  if (roundLabel === null) return null;
  const label = normaliseLabel(roundLabel);
  if (label === "PRE SEED") return "pre_seed";
  if (["MICRO SEED", "SEED", "SEED+", "SEED EXTENSION"].includes(label)) return "seed";
  if (label === "SERIES A" || label === "SERIES A EXTENSION") return "series_a";
  if (/^SERIES [B-Z]( EXTENSION)?$/.test(label)) return "series_b_plus";
  return null;
}

export function stageRank(roundLabel: string | null): number {
  const bucket = stageBucket(roundLabel);
  return bucket === null ? STAGE_BUCKETS.length : STAGE_BUCKETS.indexOf(bucket);
}
