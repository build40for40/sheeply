import type { InvestmentHistory } from "./investments.ts";
import { identified, participantOf } from "./investments.ts";
import type { Rate } from "./ratio.ts";
import { rate } from "./ratio.ts";
import type { Round } from "./types.ts";

export type LeadStatus =
  | "sole_lead"
  | "co_lead"
  /** `is_lead: false` on a round where another participant is flagged as lead. */
  | "not_led"
  /** `is_lead: false`, but nobody on the round is flagged as lead, so the flag may only mean "not recorded". */
  | "no_lead_recorded"
  /** `is_lead: null`, or the investor is missing from the round's participants. */
  | "unknown";

/** Reads only the round's own participant flags; announcement dates never decide who led. */
export function leadStatus(round: Round, investorId: string): LeadStatus {
  const self = participantOf(round, investorId);
  if (!self || self.isLead === null) return "unknown";
  const otherLead = round.participants.some((p) => p.id !== investorId && p.isLead === true);
  if (self.isLead) return otherLead ? "co_lead" : "sole_lead";
  return otherLead ? "not_led" : "no_lead_recorded";
}

export interface LeadStats {
  rounds: number;
  recorded_lead: number;
  sole_lead: number;
  co_lead: number;
  recorded_non_lead: number;
  false_with_no_lead_on_round: number;
  null_lead_flag: number;
  usable_lead_status: number;
  lead_rate: Rate;
  lead_status_completeness: Rate;
  sensitivity: {
    /** Treats every `is_lead: false` as a confirmed non-lead, as the raw flag reads. */
    lead_rate_if_every_false_is_non_lead: Rate;
  };
}

export interface InvestmentLeadership {
  role: "metric";
  question: "How frequently does this investor lead its initial investments?";
  measures: string;
  initial_investments: LeadStats;
  all_participations: LeadStats;
}

export function leadStats(rounds: Round[], investorId: string): LeadStats {
  const counts = { sole_lead: 0, co_lead: 0, not_led: 0, no_lead_recorded: 0, unknown: 0 };
  for (const round of rounds) counts[leadStatus(round, investorId)]++;
  const led = counts.sole_lead + counts.co_lead;
  const usable = led + counts.not_led;
  return {
    rounds: rounds.length,
    recorded_lead: led,
    sole_lead: counts.sole_lead,
    co_lead: counts.co_lead,
    recorded_non_lead: counts.not_led,
    false_with_no_lead_on_round: counts.no_lead_recorded,
    null_lead_flag: counts.unknown,
    usable_lead_status: usable,
    lead_rate: rate(led, usable),
    lead_status_completeness: rate(usable, rounds.length),
    sensitivity: { lead_rate_if_every_false_is_non_lead: rate(led, usable + counts.no_lead_recorded) },
  };
}

export function investmentLeadership(history: InvestmentHistory): InvestmentLeadership {
  const companies = identified(history);
  return {
    role: "metric",
    question: "How frequently does this investor lead its initial investments?",
    measures:
      "Dealroom's lead flag on the investor's first observed participation in each company. This is observable participation, not who originated or committed first.",
    initial_investments: leadStats(
      companies.map((company) => company.initial!),
      history.investorId,
    ),
    all_participations: leadStats(
      companies.flatMap((company) => company.participations),
      history.investorId,
    ),
  };
}
