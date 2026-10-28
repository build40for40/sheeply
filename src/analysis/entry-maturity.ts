import type { InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import type { CountShare, Rate, Summary } from "./ratio.ts";
import { countShare, rate, ratio, summarise, tally } from "./ratio.ts";
import type { StageBucket } from "./stages.ts";
import { STAGE_BUCKETS, normaliseLabel, stageBucket } from "./stages.ts";

export interface StageCount extends CountShare {
  /** Share among first investments with a known stage; null for the unknown bucket. */
  share_of_known_stage: number | null;
}

export type EntryPosition = "0" | "1" | "2" | "3+" | "uncertain";
const POSITIONS: EntryPosition[] = ["0", "1", "2", "3+", "uncertain"];

export interface EntryMaturity {
  role: "metric";
  question: "How early does this investor enter companies?";
  stage_source: "round_label";
  first_investments: number;
  known_stage: number;
  distribution: Record<StageBucket | "unknown", StageCount>;
  unknown_breakdown: {
    no_round_label_by_standardized_round: Record<string, number>;
    unmapped_round_labels: Record<string, number>;
  };
  first_investments_by_standardized_round: Record<string, number>;
  explanatory_attributes: {
    note: string;
    entry_position: {
      basis: "company VC rounds dated definitely before the investor's first observed round";
      prior_vc_rounds: Record<EntryPosition, CountShare>;
      entered_at_company_first_known_vc_round: Rate;
    };
    company_age_at_entry_years: {
      basis: "entry year minus company launch year";
      known: number;
      unknown: number;
      entry_before_recorded_launch: number;
      summary: Summary;
    };
    prior_vc_capital: {
      basis: "sum of disclosed amounts of company VC rounds definitely before the entry";
      currency: string | null;
      complete: number;
      incomplete: number;
      summary_of_complete: Summary;
    };
  };
}

const position = (prior: number, uncertain: number): EntryPosition =>
  uncertain > 0 ? "uncertain" : prior >= 3 ? "3+" : (String(prior) as EntryPosition);

/**
 * Stage of the round in which the investor first appears on each company, from Dealroom's own
 * `round_label`. Company age and prior capital are reported beside it to explain the stage, not
 * scored: they measure the same company maturity.
 */
export function entryMaturity(history: InvestmentHistory): EntryMaturity {
  const companies = identified(history);
  const initials = companies.map((company) => company.initial!);
  const counts = Object.fromEntries(STAGE_BUCKETS.map((bucket) => [bucket, 0])) as Record<StageBucket, number>;
  const noLabel: string[] = [];
  const unmapped: string[] = [];

  for (const round of initials) {
    const bucket = stageBucket(round.roundLabel);
    if (bucket) counts[bucket]++;
    else if (round.roundLabel === null) noLabel.push(round.standardizedRound ?? "(none)");
    else unmapped.push(normaliseLabel(round.roundLabel));
  }
  const total = initials.length;
  const known = total - noLabel.length - unmapped.length;
  const distribution = Object.fromEntries(
    STAGE_BUCKETS.map((bucket) => [bucket, { ...countShare(counts[bucket], total), share_of_known_stage: ratio(counts[bucket], known) }]),
  ) as Record<StageBucket, StageCount>;

  const entries = companies.map((company) => company.entry!);
  const positions = entries.map((entry) => position(entry.priorVcRounds, entry.uncertainVcRounds));
  const positionCounts = tally(positions);
  const atFirst = companies.filter((c) => c.entry!.uncertainVcRounds === 0 && c.entry!.companyFirstVcRoundId === c.initial!.id).length;
  const certain = positions.filter((p) => p !== "uncertain").length;

  const ages = entries.map((entry) => entry.companyAgeAtEntryYears).filter((age): age is number => age !== null);
  const completeCapital = entries.filter((entry) => entry.uncertainVcRounds === 0 && entry.priorVcRoundsWithoutAmount === 0);
  const currencies = [...new Set(initials.map((round) => round.currency).filter(Boolean))];

  return {
    role: "metric",
    question: "How early does this investor enter companies?",
    stage_source: "round_label",
    first_investments: total,
    known_stage: known,
    distribution: { ...distribution, unknown: { ...countShare(total - known, total), share_of_known_stage: null } },
    unknown_breakdown: {
      no_round_label_by_standardized_round: tally(noLabel),
      unmapped_round_labels: tally(unmapped),
    },
    first_investments_by_standardized_round: tally(initials.map((round) => round.standardizedRound ?? "(none)")),
    explanatory_attributes: {
      note: "Descriptive context for entry stage. Not scored: company age and prior capital measure the same maturity as stage.",
      entry_position: {
        basis: "company VC rounds dated definitely before the investor's first observed round",
        prior_vc_rounds: Object.fromEntries(POSITIONS.map((p) => [p, countShare(positionCounts[p] ?? 0, total)])) as Record<
          EntryPosition,
          CountShare
        >,
        entered_at_company_first_known_vc_round: rate(atFirst, certain),
      },
      company_age_at_entry_years: {
        basis: "entry year minus company launch year",
        known: ages.length,
        unknown: total - ages.length,
        entry_before_recorded_launch: ages.filter((age) => age < 0).length,
        summary: summarise(ages.filter((age) => age >= 0)),
      },
      prior_vc_capital: {
        basis: "sum of disclosed amounts of company VC rounds definitely before the entry",
        currency: currencies.length === 1 ? currencies[0]! : null,
        complete: completeCapital.length,
        incomplete: total - completeCapital.length,
        summary_of_complete: summarise(completeCapital.map((entry) => entry.priorVcCapital)),
      },
    },
  };
}
