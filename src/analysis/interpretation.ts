import type { DataQuality } from "./data-quality.ts";
import type { EntryMaturity } from "./entry-maturity.ts";
import type { InvestmentLeadership } from "./leadership.ts";

/**
 * Fixed thresholds behind every statement. They describe this investor's own observed data; none
 * is a market benchmark, so statements say "most" or "a minority", never "high" or "low". Only the
 * two metrics are interpreted; sector exposure and syndicate relationships stay descriptive.
 */
export const THRESHOLDS = {
  minimumSample: 10,
  majorityShare: 0.5,
  lowCoverage: 0.7,
} as const;

export interface Statement {
  rule: string;
  statement: string;
  evidence: Record<string, number | string | null>;
}

const pct = (share: number | null): string => (share === null ? "n/a" : `${Math.round(share * 100)}%`);

export function interpret(entry: EntryMaturity, leadership: InvestmentLeadership, quality: DataQuality): Statement[] {
  const out: Statement[] = [];
  const t = THRESHOLDS;
  const d = entry.distribution;

  const early = d.pre_seed.count + d.seed.count;
  const later = d.series_a.count + d.series_b_plus.count;
  if (entry.known_stage < t.minimumSample) {
    out.push({
      rule: "entry_maturity.insufficient_sample",
      statement: `Too few first investments with a known stage (${entry.known_stage}) to describe entry maturity.`,
      evidence: { known_stage: entry.known_stage, minimum_sample: t.minimumSample },
    });
  } else {
    const earlyShare = early / entry.known_stage;
    const majority = earlyShare >= t.majorityShare;
    out.push({
      rule: majority ? "entry_maturity.majority_pre_seed_or_seed" : "entry_maturity.majority_series_a_or_later",
      statement:
        `${majority ? "Most" : "A minority of"} first investments with a known stage were at pre-seed or seed ` +
        `(${early} of ${entry.known_stage}, ${pct(earlyShare)}). A further ${d.unknown.count} of ${entry.first_investments} ` +
        `first investments (${pct(d.unknown.share)}) have no Dealroom stage.`,
      evidence: {
        pre_seed_or_seed: early,
        series_a_or_later: later,
        known_stage: entry.known_stage,
        unknown_stage: d.unknown.count,
        threshold: t.majorityShare,
      },
    });
    const atFirst = entry.explanatory_attributes.entry_position.entered_at_company_first_known_vc_round;
    out.push({
      rule: "entry_maturity.entry_position",
      statement: `The first observed investment was the company's earliest known VC round in ${atFirst.numerator} of ${atFirst.denominator} companies (${pct(atFirst.value)}).`,
      evidence: { numerator: atFirst.numerator, denominator: atFirst.denominator },
    });
  }

  const initial = leadership.initial_investments;
  const leadRate = initial.lead_rate;
  if (initial.usable_lead_status < t.minimumSample) {
    out.push({
      rule: "investment_leadership.insufficient_sample",
      statement: `Too few first investments with a usable lead status (${initial.usable_lead_status}) to describe lead behaviour.`,
      evidence: { usable_lead_status: initial.usable_lead_status, minimum_sample: t.minimumSample },
    });
  } else {
    const majority = (leadRate.value ?? 0) >= t.majorityShare;
    out.push({
      rule: majority ? "investment_leadership.led_majority" : "investment_leadership.led_minority",
      statement: `Recorded as lead or co-lead on ${majority ? "most" : "a minority"} of first investments with a usable lead status (${leadRate.numerator} of ${leadRate.denominator}, ${pct(leadRate.value)}).`,
      evidence: { numerator: leadRate.numerator, denominator: leadRate.denominator, threshold: t.majorityShare },
    });
    if (!majority) {
      out.push({
        rule: "investment_leadership.caveat",
        statement:
          "A minority lead rate alone does not establish follower behaviour: it is also consistent with deliberate co-investing, and the lead flag shows observed participation, not who originated the round.",
        evidence: {},
      });
    }
  }
  const asReported = initial.sensitivity.lead_rate_if_every_false_is_non_lead;
  if (initial.false_with_no_lead_on_round > 0 && leadRate.value !== null) {
    out.push({
      rule: "investment_leadership.sensitivity",
      statement: `${initial.false_with_no_lead_on_round} first investments are on rounds where nobody is flagged as lead. Reading every false flag as a confirmed non-lead would give ${pct(asReported.value)} instead of ${pct(leadRate.value)}.`,
      evidence: {
        false_with_no_lead_on_round: initial.false_with_no_lead_on_round,
        lead_rate: leadRate.value,
        lead_rate_if_every_false_is_non_lead: asReported.value,
      },
    });
  }

  for (const [key, label] of [
    ["entry_stage", "entry stage"],
    ["lead_status", "lead status"],
  ] as const) {
    const coverage = quality.coverage[key];
    if (coverage.value !== null && coverage.value < t.lowCoverage) {
      out.push({
        rule: `data_quality.${key}_coverage`,
        statement: `Only ${coverage.numerator} of ${coverage.denominator} first investments (${pct(coverage.value)}) have a usable ${label}, so that figure describes a subset that may not be representative.`,
        evidence: { numerator: coverage.numerator, denominator: coverage.denominator, threshold: t.lowCoverage },
      });
    }
  }
  if (quality.portfolio.complete === false) {
    out.push({
      rule: "data_quality.portfolio_incomplete",
      statement: `Dealroom reports ${quality.portfolio.reported_by_dealroom} portfolio companies but returned ${quality.portfolio.rows_returned}.`,
      evidence: { reported: quality.portfolio.reported_by_dealroom, returned: quality.portfolio.rows_returned },
    });
  }
  return out;
}
