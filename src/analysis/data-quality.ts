import type { EntryMaturity } from "./entry-maturity.ts";
import type { CompanyStatus, InvestmentFlag, InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import type { InvestmentLeadership } from "./leadership.ts";
import type { Rate } from "./ratio.ts";
import { rate } from "./ratio.ts";
import type { SectorExposure } from "./sector-exposure.ts";
import { stageBucket } from "./stages.ts";
import type { Dataset } from "./types.ts";

export interface Exclusion {
  output: "all" | "entry_maturity" | "investment_leadership" | "sector_exposure";
  reason: string;
  count: number;
}

export interface DataQuality {
  portfolio: {
    rows_returned: number;
    reported_by_dealroom: number | null;
    complete: boolean | null;
    by_status: Record<CompanyStatus, number>;
    rounds_count_mismatch: number;
  };
  rounds: {
    returned: number;
    reported_by_dealroom: number | null;
    undated: number;
    year_precision_only: number;
    investors_not_disclosed: number;
    without_round_label: number;
    outside_portfolio_listing: number;
  };
  funding_histories: {
    companies_without_any_round: number;
    /** The company's earliest known VC round is Series A or later, so earlier rounds are probably missing. */
    history_starts_at_series_a_or_later: number;
    first_investment_flags: Record<InvestmentFlag, number>;
  };
  lead_flags: {
    participant_flags: { true: number; false: number; null: number };
    rounds_with_participants: number;
    rounds_with_a_flagged_lead: Rate;
    single_participant_rounds_flagged_false: number;
  };
  coverage: {
    first_investment_identification: Rate;
    entry_stage: Rate;
    lead_status: Rate;
    sector: Rate;
  };
  exclusions: Exclusion[];
}

const STATUSES: CompanyStatus[] = [
  "initial_identified",
  "no_round_attribution",
  "rounds_not_matched",
  "participation_undisclosed",
  "not_a_company",
];
const FLAGS: InvestmentFlag[] = [
  "initial_ordering_ambiguous",
  "undated_participation",
  "initial_undated",
  "earlier_round_investors_undisclosed",
];

export function dataQuality(
  dataset: Dataset,
  history: InvestmentHistory,
  outputs: { entry: EntryMaturity; leadership: InvestmentLeadership; sectors: SectorExposure },
): DataQuality {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<CompanyStatus, number>;
  for (const company of history.companies) byStatus[company.status]++;
  const flags = Object.fromEntries(FLAGS.map((f) => [f, 0])) as Record<InvestmentFlag, number>;
  for (const company of identified(history)) for (const flag of company.flags) flags[flag]++;

  const companies = history.companies.filter((c) => c.status !== "not_a_company");
  const reported = dataset.investor.reportedPortfolioTotal;
  const { entry, leadership, sectors } = outputs;
  const initial = leadership.initial_investments;

  const roundsById = new Map(dataset.rounds.map((round) => [round.id, round]));
  const lateStart = identified(history).filter((company) => {
    const firstVc = company.entry!.companyFirstVcRoundId;
    const bucket = firstVc === null ? null : stageBucket(roundsById.get(firstVc)?.roundLabel ?? null);
    return bucket === "series_a" || bucket === "series_b_plus";
  }).length;

  const withParticipants = dataset.rounds.filter((r) => r.participants.length > 0);
  const participants = dataset.rounds.flatMap((r) => r.participants);

  const exclusions: Exclusion[] = [
    { output: "all", reason: "portfolio row is not a company", count: byStatus.not_a_company },
    { output: "all", reason: "no round attribution in Dealroom (rounds_count 0)", count: byStatus.no_round_attribution },
    { output: "all", reason: "portfolio claims rounds but none of the returned rounds lists the investor", count: byStatus.rounds_not_matched },
    { output: "all", reason: "investor not found and some company rounds have no investor list", count: byStatus.participation_undisclosed },
    { output: "entry_maturity", reason: "first investment has no Dealroom round_label (counted as unknown)", count: sum(entry.unknown_breakdown.no_round_label_by_standardized_round) },
    { output: "entry_maturity", reason: "first investment has a round_label outside the mapped ladder (counted as unknown)", count: sum(entry.unknown_breakdown.unmapped_round_labels) },
    { output: "investment_leadership", reason: "is_lead false but nobody on the first-investment round is flagged as lead", count: initial.false_with_no_lead_on_round },
    { output: "investment_leadership", reason: "is_lead null on the first-investment round", count: initial.null_lead_flag },
    { output: "sector_exposure", reason: "taxonomy not returned for company", count: sectors.taxonomy_not_returned },
    { output: "sector_exposure", reason: "company has no industry label", count: sectors.without_industry },
  ];

  return {
    portfolio: {
      rows_returned: dataset.portfolio.length,
      reported_by_dealroom: reported,
      complete: reported === null ? null : dataset.portfolio.length >= reported,
      by_status: byStatus,
      rounds_count_mismatch: identified(history).filter((c) => c.participations.length !== c.roundsCountReported).length,
    },
    rounds: {
      returned: dataset.rounds.length,
      reported_by_dealroom: dataset.provenance.transactionsReportedTotal,
      undated: dataset.rounds.filter((r) => r.announcedDate === null).length,
      year_precision_only: dataset.rounds.filter((r) => r.announcedDate?.length === 4).length,
      investors_not_disclosed: dataset.rounds.filter((r) => !r.investorsDisclosed).length,
      without_round_label: dataset.rounds.filter((r) => r.roundLabel === null).length,
      outside_portfolio_listing: history.roundsOutsidePortfolio.length,
    },
    funding_histories: {
      companies_without_any_round: companies.filter((c) => c.companyRoundsObserved === 0).length,
      history_starts_at_series_a_or_later: lateStart,
      first_investment_flags: flags,
    },
    lead_flags: {
      participant_flags: {
        true: participants.filter((p) => p.isLead === true).length,
        false: participants.filter((p) => p.isLead === false).length,
        null: participants.filter((p) => p.isLead === null).length,
      },
      rounds_with_participants: withParticipants.length,
      rounds_with_a_flagged_lead: rate(
        withParticipants.filter((r) => r.participants.some((p) => p.isLead === true)).length,
        withParticipants.length,
      ),
      single_participant_rounds_flagged_false: withParticipants.filter(
        (r) => r.participants.length === 1 && r.participants[0]!.isLead === false,
      ).length,
    },
    coverage: {
      first_investment_identification: rate(byStatus.initial_identified, companies.length),
      entry_stage: rate(entry.known_stage, entry.first_investments),
      lead_status: initial.lead_status_completeness,
      sector: rate(sectors.labelled, sectors.first_investments),
    },
    exclusions: exclusions.filter((e) => e.count > 0),
  };
}

const sum = (record: Record<string, number>): number => Object.values(record).reduce((a, b) => a + b, 0);
