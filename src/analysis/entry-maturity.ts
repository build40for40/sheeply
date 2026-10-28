import type { InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import type { CountShare } from "./ratio.ts";
import { countShare, tally } from "./ratio.ts";
import type { StageBucket } from "./stages.ts";
import { STAGE_BUCKETS, normaliseLabel, stageBucket } from "./stages.ts";

export interface EntryMaturity {
  basis: "round_label";
  companies_with_initial_investment: number;
  known_stage: number;
  unknown_stage: number;
  distribution: Record<StageBucket, CountShare>;
  unknown_stage_breakdown: {
    no_round_label_by_standardized_round: Record<string, number>;
    unmapped_round_labels: Record<string, number>;
  };
  initial_rounds_by_standardized_round: Record<string, number>;
}

/** Stage of the round in which the investor first appears on each company, from Dealroom's own `round_label`. */
export function entryMaturity(history: InvestmentHistory): EntryMaturity {
  const initials = identified(history).map((company) => company.initial!);
  const counts = Object.fromEntries(STAGE_BUCKETS.map((bucket) => [bucket, 0])) as Record<StageBucket, number>;
  const noLabel: string[] = [];
  const unmapped: string[] = [];

  for (const round of initials) {
    const bucket = stageBucket(round.roundLabel);
    if (bucket) counts[bucket]++;
    else if (round.roundLabel === null) noLabel.push(round.standardizedRound ?? "(none)");
    else unmapped.push(normaliseLabel(round.roundLabel));
  }

  const known = initials.length - noLabel.length - unmapped.length;
  return {
    basis: "round_label",
    companies_with_initial_investment: initials.length,
    known_stage: known,
    unknown_stage: initials.length - known,
    distribution: Object.fromEntries(STAGE_BUCKETS.map((bucket) => [bucket, countShare(counts[bucket], known)])) as Record<
      StageBucket,
      CountShare
    >,
    unknown_stage_breakdown: {
      no_round_label_by_standardized_round: tally(noLabel),
      unmapped_round_labels: tally(unmapped),
    },
    initial_rounds_by_standardized_round: tally(initials.map((round) => round.standardizedRound ?? "(none)")),
  };
}
