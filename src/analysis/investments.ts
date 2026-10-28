import { compareStrings } from "../util.ts";
import { dateSpan, overlaps } from "./partial-date.ts";
import { stageRank } from "./stages.ts";
import type { Dataset, Participant, Round } from "./types.ts";

export type CompanyStatus =
  /** The investor appears on at least one of the company's rounds. */
  | "initial_identified"
  /** Dealroom lists the company in the portfolio with `rounds_count: 0`: a stake not tied to any known round. */
  | "no_round_attribution"
  /** The portfolio says the investor joined rounds, but none of the company's returned rounds lists it. */
  | "rounds_not_matched"
  /** The portfolio row is a university, gov/NGO or investor, not a company. */
  | "not_a_company";

export type InvestmentFlag =
  /** Another of the investor's rounds in this company has an overlapping partial date, so which came first is uncertain. */
  | "initial_ordering_ambiguous"
  /** At least one other participation has no date, so it may precede the chosen initial round. */
  | "undated_participation"
  /** The chosen initial round itself has no date. */
  | "initial_undated";

export interface CompanyInvestment {
  companyId: string;
  companyName: string;
  status: CompanyStatus;
  roundsCountReported: number;
  companyRoundsObserved: number;
  participations: Round[];
  initial: Round | null;
  followOns: Round[];
  flags: InvestmentFlag[];
}

export interface InvestmentHistory {
  investorId: string;
  companies: CompanyInvestment[];
  /** Rounds in scope whose company is missing from the portfolio listing. */
  roundsOutsidePortfolio: Round[];
}

export const participantOf = (round: Round, entityId: string): Participant | undefined =>
  round.participants.find((participant) => participant.id === entityId);

/**
 * Chronological order using only facts known at the time of each round: the announced date, then
 * the earlier stage, then the Dealroom id. Undated rounds sort last because they cannot be placed.
 */
export function compareRounds(a: Round, b: Round): number {
  const spanA = dateSpan(a.announcedDate);
  const spanB = dateSpan(b.announcedDate);
  if (spanA === null || spanB === null) {
    if (spanA !== spanB) return spanA === null ? 1 : -1;
  } else {
    const byDate = compareStrings(spanA.start, spanB.start) || compareStrings(spanA.end, spanB.end);
    if (byDate !== 0) return byDate;
  }
  return stageRank(a.roundLabel) - stageRank(b.roundLabel) || a.id - b.id;
}

export function buildInvestmentHistory(dataset: Dataset): InvestmentHistory {
  const investorId = dataset.investor.id;
  const roundsByCompany = new Map<string, Round[]>();
  for (const round of dataset.rounds) {
    const list = roundsByCompany.get(round.companyId) ?? [];
    list.push(round);
    roundsByCompany.set(round.companyId, list);
  }

  const companies = dataset.portfolio.map((entry): CompanyInvestment => {
    const companyRounds = roundsByCompany.get(entry.companyId) ?? [];
    const participations = companyRounds.filter((round) => participantOf(round, investorId)).sort(compareRounds);
    const [initial = null, ...followOns] = participations;

    let status: CompanyStatus;
    if (entry.companySubtype !== null && entry.companySubtype !== "company") status = "not_a_company";
    else if (initial) status = "initial_identified";
    else if (entry.roundsCount === 0) status = "no_round_attribution";
    else status = "rounds_not_matched";

    return {
      companyId: entry.companyId,
      companyName: entry.companyName,
      status,
      roundsCountReported: entry.roundsCount,
      companyRoundsObserved: companyRounds.length,
      participations,
      initial: status === "initial_identified" ? initial : null,
      followOns: status === "initial_identified" ? followOns : [],
      flags: status === "initial_identified" && initial ? flagsFor(initial, followOns) : [],
    };
  });

  const portfolioIds = new Set(dataset.portfolio.map((entry) => entry.companyId));
  return {
    investorId,
    companies,
    roundsOutsidePortfolio: dataset.rounds.filter((round) => !portfolioIds.has(round.companyId)),
  };
}

function flagsFor(initial: Round, followOns: Round[]): InvestmentFlag[] {
  const flags: InvestmentFlag[] = [];
  const initialSpan = dateSpan(initial.announcedDate);
  if (initialSpan === null) flags.push("initial_undated");
  if (followOns.some((round) => round.announcedDate === null) && initialSpan !== null) flags.push("undated_participation");
  const next = followOns[0];
  const nextSpan = next ? dateSpan(next.announcedDate) : null;
  if (initialSpan && nextSpan && overlaps(initialSpan, nextSpan)) flags.push("initial_ordering_ambiguous");
  return flags;
}

export const identified = (history: InvestmentHistory): CompanyInvestment[] =>
  history.companies.filter((company) => company.initial !== null);
