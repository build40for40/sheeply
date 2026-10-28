import type { InvestmentHistory } from "./investments.ts";
import { identified, participantOf } from "./investments.ts";
import { ratio } from "./ratio.ts";
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

export function leadStatus(round: Round, investorId: string): LeadStatus {
  const self = participantOf(round, investorId);
  if (!self || self.isLead === null) return "unknown";
  const otherLead = round.participants.some((p) => p.id !== investorId && p.isLead === true);
  if (self.isLead) return otherLead ? "co_lead" : "sole_lead";
  return otherLead ? "not_led" : "no_lead_recorded";
}

export interface LeadBreakdown {
  rounds: number;
  led: number;
  sole_lead: number;
  co_lead: number;
  not_led: number;
  no_lead_recorded: number;
  unknown: number;
  /** Rounds where the lead is known: the investor led, or someone else is flagged as lead. */
  known: number;
  led_share_of_known: number | null;
  not_led_share_of_known: number | null;
  lead_status_coverage: number | null;
  /** Sensitivity check: treats every `is_lead: false` as a non-lead, as the raw flag reads. */
  led_share_if_unflagged_means_not_led: number | null;
}

export interface Leadership {
  initial_rounds: LeadBreakdown;
  all_participations: LeadBreakdown;
}

export function breakdown(rounds: Round[], investorId: string): LeadBreakdown {
  const counts = { sole_lead: 0, co_lead: 0, not_led: 0, no_lead_recorded: 0, unknown: 0 };
  for (const round of rounds) counts[leadStatus(round, investorId)]++;
  const led = counts.sole_lead + counts.co_lead;
  const known = led + counts.not_led;
  return {
    rounds: rounds.length,
    led,
    ...counts,
    known,
    led_share_of_known: ratio(led, known),
    not_led_share_of_known: ratio(counts.not_led, known),
    lead_status_coverage: ratio(known, rounds.length),
    led_share_if_unflagged_means_not_led: ratio(led, known + counts.no_lead_recorded),
  };
}

export function leadership(history: InvestmentHistory): Leadership {
  const companies = identified(history);
  return {
    initial_rounds: breakdown(
      companies.map((company) => company.initial!),
      history.investorId,
    ),
    all_participations: breakdown(
      companies.flatMap((company) => company.participations),
      history.investorId,
    ),
  };
}
