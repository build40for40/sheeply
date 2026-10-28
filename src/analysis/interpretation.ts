import type { DataQuality } from "./data-quality.ts";
import type { EntryMaturity } from "./entry-maturity.ts";
import type { Leadership } from "./leadership.ts";
import type { Syndicates } from "./syndicates.ts";

/**
 * Fixed thresholds behind every statement. They describe this investor's own observed data; none
 * is a market benchmark, so statements say "most" or "a minority", never "high" or "low".
 */
export const THRESHOLDS = {
  minimumSample: 10,
  majorityShare: 0.5,
  concentratedTopLead: 0.25,
  diversifiedTopLead: 0.1,
  lowCoverage: 0.7,
} as const;

export interface Statement {
  rule: string;
  statement: string;
  evidence: Record<string, number | string | null>;
}

const pct = (share: number | null): string => (share === null ? "n/a" : `${Math.round(share * 100)}%`);

export function interpret(entry: EntryMaturity, lead: Leadership, synd: Syndicates, quality: DataQuality): Statement[] {
  const out: Statement[] = [];
  const t = THRESHOLDS;

  const early = entry.distribution.pre_seed.count + entry.distribution.seed.count;
  const earlyShare = entry.known_stage === 0 ? null : early / entry.known_stage;
  if (entry.known_stage < t.minimumSample) {
    out.push({
      rule: "entry_stage.insufficient_sample",
      statement: `Too few first investments with a known stage (${entry.known_stage}) to describe entry maturity.`,
      evidence: { known_stage: entry.known_stage, minimum_sample: t.minimumSample },
    });
  } else if (earlyShare !== null && earlyShare >= t.majorityShare) {
    out.push({
      rule: "entry_stage.majority_pre_seed_or_seed",
      statement: `Most first investments with a known stage (${pct(earlyShare)} of ${entry.known_stage}) were at pre-seed or seed.`,
      evidence: { pre_seed_or_seed: early, known_stage: entry.known_stage, threshold: t.majorityShare },
    });
  } else {
    out.push({
      rule: "entry_stage.majority_series_a_or_later",
      statement: `Most first investments with a known stage (${pct(earlyShare === null ? null : 1 - earlyShare)} of ${entry.known_stage}) were at Series A or later.`,
      evidence: { series_a_or_later: entry.known_stage - early, known_stage: entry.known_stage, threshold: t.majorityShare },
    });
  }

  const initial = lead.initial_rounds;
  if (initial.known < t.minimumSample) {
    out.push({
      rule: "leadership.insufficient_sample",
      statement: `Too few initial rounds with a known lead status (${initial.known}) to describe lead behaviour.`,
      evidence: { known: initial.known, minimum_sample: t.minimumSample },
    });
  } else if ((initial.led_share_of_known ?? 0) >= t.majorityShare) {
    out.push({
      rule: "leadership.led_majority",
      statement: `Led or co-led most initial rounds with a known lead status (${pct(initial.led_share_of_known)} of ${initial.known}).`,
      evidence: { led: initial.led, known: initial.known, threshold: t.majorityShare },
    });
  } else {
    out.push({
      rule: "leadership.led_minority",
      statement: `Led or co-led a minority of initial rounds with a known lead status (${pct(initial.led_share_of_known)} of ${initial.known}).`,
      evidence: { led: initial.led, known: initial.known, threshold: t.majorityShare },
    });
    out.push({
      rule: "leadership.caveat",
      statement: "A minority lead rate alone does not establish follower behaviour: it is also consistent with deliberate co-investing or incomplete lead data.",
      evidence: {},
    });
  }

  const asReported = initial.led_share_if_unflagged_means_not_led;
  if (initial.no_lead_recorded > 0 && initial.led_share_of_known !== null && asReported !== null) {
    out.push({
      rule: "leadership.sensitivity",
      statement: `${initial.no_lead_recorded} initial rounds have no lead flagged for anyone. Counting those as non-leads would put the lead rate at ${pct(asReported)} instead of ${pct(initial.led_share_of_known)}.`,
      evidence: { no_lead_recorded: initial.no_lead_recorded, led_share_of_known: initial.led_share_of_known, led_share_if_unflagged_means_not_led: asReported },
    });
  }

  const partners = synd.lead_partners;
  const dependence = partners.top_lead_dependence;
  if (partners.rounds < t.minimumSample) {
    out.push({
      rule: "syndicates.insufficient_sample",
      statement: `Too few initial rounds led by another investor (${partners.rounds}) to describe lead-partner concentration.`,
      evidence: { rounds: partners.rounds, minimum_sample: t.minimumSample },
    });
  } else if (dependence !== null && dependence >= t.concentratedTopLead) {
    out.push({
      rule: "syndicates.concentrated",
      statement: `Entries led by others are concentrated: ${partners.top_lead!.name} led ${pct(dependence)} of ${partners.rounds}.`,
      evidence: { top_lead_dependence: dependence, threshold: t.concentratedTopLead },
    });
  } else if (dependence !== null && dependence <= t.diversifiedTopLead) {
    out.push({
      rule: "syndicates.diversified",
      statement: `Entries led by others are spread across ${partners.unique_lead_partners} lead partners; the most frequent led ${pct(dependence)} of ${partners.rounds}.`,
      evidence: { top_lead_dependence: dependence, unique_lead_partners: partners.unique_lead_partners, threshold: t.diversifiedTopLead },
    });
  } else {
    out.push({
      rule: "syndicates.moderate",
      statement: `The most frequent lead partner (${partners.top_lead?.name ?? "n/a"}) led ${pct(dependence)} of ${partners.rounds} entries led by others, across ${partners.unique_lead_partners} lead partners.`,
      evidence: {
        top_lead_dependence: dependence,
        diversified_threshold: t.diversifiedTopLead,
        concentrated_threshold: t.concentratedTopLead,
      },
    });
  }

  for (const [key, label] of [
    ["entry_stage", "entry-stage"],
    ["lead_status", "lead-status"],
  ] as const) {
    const coverage = quality.coverage[key];
    if (coverage !== null && coverage < t.lowCoverage) {
      out.push({
        rule: `data_quality.${key}_coverage`,
        statement: `Only ${pct(coverage)} of identified first investments have a known ${label.replace("-", " ")}, so the ${label} figures describe a subset that may not be representative.`,
        evidence: { coverage, threshold: t.lowCoverage },
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
