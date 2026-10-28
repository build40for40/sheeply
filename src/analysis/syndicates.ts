import { compareStrings } from "../util.ts";
import type { InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import { leadStatus } from "./leadership.ts";
import { ratio } from "./ratio.ts";
import type { Participant, Round } from "./types.ts";

export const TOP_PARTNERS = 10;

export interface Partner {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  rounds: number;
  share: number | null;
}

export interface Syndicates {
  role: "descriptive";
  note: string;
  lead_partners: {
    basis: "initial_rounds_led_by_another_investor";
    rounds: number;
    unique_lead_partners: number;
    top_lead: Partner | null;
    top_lead_dependence: number | null;
    herfindahl_index: number | null;
    top: Partner[];
  };
  co_investors: {
    basis: "all_participations_with_disclosed_investors";
    rounds_considered: number;
    unique_co_investors: number;
    repeat_co_investors: number;
    top: Partner[];
  };
}

interface Tally {
  participant: Participant;
  rounds: number;
  weight: number;
}

function rank(tallies: Map<string, Tally>, denominator: number): Partner[] {
  return [...tallies.values()]
    .sort((a, b) => b.rounds - a.rounds || compareStrings(a.participant.name, b.participant.name) || compareStrings(a.participant.id, b.participant.id))
    .map(({ participant, rounds }) => ({
      id: participant.id,
      name: participant.name,
      type: participant.type,
      subtype: participant.subtype,
      rounds,
      share: ratio(rounds, denominator),
    }));
}

function add(tallies: Map<string, Tally>, participant: Participant, weight: number) {
  const entry = tallies.get(participant.id) ?? { participant, rounds: 0, weight: 0 };
  entry.rounds++;
  entry.weight += weight;
  tallies.set(participant.id, entry);
}

/**
 * Who led the initial rounds this investor joined while another investor led, and who it co-invests with.
 * A round with several leads credits each of them once in the counts; the Herfindahl index splits
 * that round's weight equally so shares sum to one.
 */
export function syndicates(history: InvestmentHistory): Syndicates {
  const investorId = history.investorId;
  const companies = identified(history);

  const ledByOthers = companies.map((c) => c.initial!).filter((round) => leadStatus(round, investorId) === "not_led");
  const leads = new Map<string, Tally>();
  for (const round of ledByOthers) {
    const roundLeads = round.participants.filter((p) => p.id !== investorId && p.isLead === true);
    for (const lead of roundLeads) add(leads, lead, 1 / roundLeads.length);
  }
  const n = ledByOthers.length;
  const rankedLeads = rank(leads, n);
  const herfindahl = n === 0 ? null : Math.round([...leads.values()].reduce((sum, t) => sum + (t.weight / n) ** 2, 0) * 10_000) / 10_000;

  const disclosed: Round[] = companies.flatMap((c) => c.participations).filter((round) => round.investorsDisclosed);
  const coInvestors = new Map<string, Tally>();
  for (const round of disclosed) {
    for (const participant of round.participants) if (participant.id !== investorId) add(coInvestors, participant, 1);
  }
  const rankedCo = rank(coInvestors, disclosed.length);

  return {
    role: "descriptive",
    note: "Context for investment leadership, not a separate measure: who led the first rounds this investor joined without leading, and who it co-invests with.",
    lead_partners: {
      basis: "initial_rounds_led_by_another_investor",
      rounds: n,
      unique_lead_partners: leads.size,
      top_lead: rankedLeads[0] ?? null,
      top_lead_dependence: rankedLeads[0]?.share ?? null,
      herfindahl_index: herfindahl,
      top: rankedLeads.slice(0, TOP_PARTNERS),
    },
    co_investors: {
      basis: "all_participations_with_disclosed_investors",
      rounds_considered: disclosed.length,
      unique_co_investors: coInvestors.size,
      repeat_co_investors: rankedCo.filter((partner) => partner.rounds >= 2).length,
      top: rankedCo.slice(0, TOP_PARTNERS),
    },
  };
}
