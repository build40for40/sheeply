import { compareStrings } from "../util.ts";
import type { DateSpan } from "./partial-date.ts";
import { dateSpan, definitelyBefore, overlaps } from "./partial-date.ts";
import { stageRank } from "./stages.ts";
import type { Company, Dataset, Participant, Round } from "./types.ts";

export type CompanyStatus =
  /** The investor appears on at least one of the company's rounds. */
  | "initial_identified"
  /** Dealroom lists the company in the portfolio with `rounds_count: 0`: a stake not tied to any known round. */
  | "no_round_attribution"
  /** The portfolio says the investor joined rounds, but none of the company's returned rounds lists it. */
  | "rounds_not_matched"
  /** As above, but some of the company's rounds have no investor list, so the participation may be hidden there. */
  | "participation_undisclosed"
  /** The portfolio row is a university, gov/NGO or investor, not a company. */
  | "not_a_company";

export type InvestmentFlag =
  /** Another of the investor's rounds in this company has an overlapping partial date, so which came first is uncertain. */
  | "initial_ordering_ambiguous"
  /** At least one other participation has no date, so it may precede the chosen initial round. */
  | "undated_participation"
  /** The chosen initial round itself has no date. */
  | "initial_undated"
  /** A company round that may be earlier has no investor list, so the investor may have entered there. */
  | "earlier_round_investors_undisclosed";

/**
 * Where the investor's first observed round sits in the company's own funding history. Uses only
 * rounds that are before it, so nothing here depends on what happened after the entry.
 */
export interface EntryContext {
  /** The company's earliest known VC round, which may or may not be the investor's first round. */
  companyFirstVcRoundId: number | null;
  /** VC rounds (other than the entry round) whose dates put them definitely before the entry. */
  priorVcRounds: number;
  /** VC rounds that cannot be ordered against the entry because of partial or missing dates. */
  uncertainVcRounds: number;
  /** Sum of disclosed amounts of the prior VC rounds. */
  priorVcCapital: number;
  priorVcRoundsWithoutAmount: number;
  /** Entry year minus launch year; null when either is unknown. */
  companyAgeAtEntryYears: number | null;
}

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
  entry: EntryContext | null;
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
    const companyRounds = [...(roundsByCompany.get(entry.companyId) ?? [])].sort(compareRounds);
    const participations = companyRounds.filter((round) => participantOf(round, investorId));
    const [initial = null, ...followOns] = participations;

    let status: CompanyStatus;
    if (entry.companySubtype !== null && entry.companySubtype !== "company") status = "not_a_company";
    else if (initial) status = "initial_identified";
    else if (entry.roundsCount === 0) status = "no_round_attribution";
    else if (companyRounds.some((round) => !round.investorsDisclosed)) status = "participation_undisclosed";
    else status = "rounds_not_matched";

    const identified = status === "initial_identified" && initial !== null;
    return {
      companyId: entry.companyId,
      companyName: entry.companyName,
      status,
      roundsCountReported: entry.roundsCount,
      companyRoundsObserved: companyRounds.length,
      participations,
      initial: identified ? initial : null,
      followOns: identified ? followOns : [],
      flags: identified ? flagsFor(initial, followOns, companyRounds) : [],
      entry: identified ? entryContext(initial, companyRounds, dataset.companies[entry.companyId]) : null,
    };
  });

  const portfolioIds = new Set(dataset.portfolio.map((entry) => entry.companyId));
  return {
    investorId,
    companies,
    roundsOutsidePortfolio: dataset.rounds.filter((round) => !portfolioIds.has(round.companyId)),
  };
}

/** True unless `round` is definitely after the entry, i.e. it could have come first. */
const mayPrecede = (round: Round, entrySpan: DateSpan | null): boolean => {
  const span = dateSpan(round.announcedDate);
  return entrySpan === null || span === null || !definitelyBefore(entrySpan, span);
};

function flagsFor(initial: Round, followOns: Round[], companyRounds: Round[]): InvestmentFlag[] {
  const flags: InvestmentFlag[] = [];
  const initialSpan = dateSpan(initial.announcedDate);
  if (initialSpan === null) flags.push("initial_undated");
  if (followOns.some((round) => round.announcedDate === null) && initialSpan !== null) flags.push("undated_participation");
  const next = followOns[0];
  const nextSpan = next ? dateSpan(next.announcedDate) : null;
  if (initialSpan && nextSpan && overlaps(initialSpan, nextSpan)) flags.push("initial_ordering_ambiguous");
  if (companyRounds.some((round) => !round.investorsDisclosed && round.id !== initial.id && mayPrecede(round, initialSpan))) {
    flags.push("earlier_round_investors_undisclosed");
  }
  return flags;
}

function entryContext(initial: Round, companyRounds: Round[], company: Company | undefined): EntryContext {
  const entrySpan = dateSpan(initial.announcedDate);
  const vcRounds = companyRounds.filter((round) => round.isVcRound === true);
  const others = vcRounds.filter((round) => round.id !== initial.id);
  const prior = others.filter((round) => {
    const span = dateSpan(round.announcedDate);
    return entrySpan !== null && span !== null && definitelyBefore(span, entrySpan);
  });

  const entryYear = initial.announcedDate === null ? null : Number(initial.announcedDate.slice(0, 4));
  const launchYear = company?.launchDate ? Number(company.launchDate.slice(0, 4)) : null;
  return {
    companyFirstVcRoundId: vcRounds[0]?.id ?? null,
    priorVcRounds: prior.length,
    uncertainVcRounds: others.filter((round) => !prior.includes(round) && mayPrecede(round, entrySpan)).length,
    priorVcCapital: prior.reduce((sum, round) => sum + (round.amount ?? 0), 0),
    priorVcRoundsWithoutAmount: prior.filter((round) => round.amount === null).length,
    companyAgeAtEntryYears: entryYear === null || launchYear === null ? null : entryYear - launchYear,
  };
}

export const identified = (history: InvestmentHistory): CompanyInvestment[] =>
  history.companies.filter((company) => company.initial !== null);
