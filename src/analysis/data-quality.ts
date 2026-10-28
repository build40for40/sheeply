import type { CompanyStatus, InvestmentFlag, InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import type { EntryMaturity } from "./entry-maturity.ts";
import type { Leadership } from "./leadership.ts";
import { ratio } from "./ratio.ts";
import type { Sectors } from "./sectors.ts";
import type { Dataset } from "./types.ts";

export interface Exclusion {
  metric: "all" | "entry_maturity" | "leadership" | "syndicates" | "sectors";
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
    outside_portfolio_listing: number;
    companies_without_any_round: number;
  };
  initial_investments: {
    identified: number;
    flags: Record<InvestmentFlag, number>;
  };
  coverage: {
    initial_investment_identification: number | null;
    entry_stage: number | null;
    lead_status: number | null;
    sector: number | null;
  };
  exclusions: Exclusion[];
}

const STATUSES: CompanyStatus[] = ["initial_identified", "no_round_attribution", "rounds_not_matched", "not_a_company"];
const FLAGS: InvestmentFlag[] = ["initial_ordering_ambiguous", "undated_participation", "initial_undated"];

export function dataQuality(
  dataset: Dataset,
  history: InvestmentHistory,
  metrics: { entry: EntryMaturity; leadership: Leadership; sectors: Sectors },
): DataQuality {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<CompanyStatus, number>;
  for (const company of history.companies) byStatus[company.status]++;
  const flags = Object.fromEntries(FLAGS.map((f) => [f, 0])) as Record<InvestmentFlag, number>;
  for (const company of identified(history)) for (const flag of company.flags) flags[flag]++;

  const companies = history.companies.filter((c) => c.status !== "not_a_company");
  const reported = dataset.investor.reportedPortfolioTotal;
  const { entry, leadership: lead, sectors: sect } = metrics;
  const initialLead = lead.initial_rounds;

  const exclusions: Exclusion[] = [
    { metric: "all", reason: "portfolio row is not a company", count: byStatus.not_a_company },
    { metric: "all", reason: "no round attribution in Dealroom (rounds_count 0)", count: byStatus.no_round_attribution },
    { metric: "all", reason: "portfolio claims rounds but none of the returned rounds lists the investor", count: byStatus.rounds_not_matched },
    { metric: "entry_maturity", reason: "initial round has no Dealroom round_label", count: sumValues(entry.unknown_stage_breakdown.no_round_label_by_standardized_round) },
    { metric: "entry_maturity", reason: "initial round has a round_label outside the mapped ladder", count: sumValues(entry.unknown_stage_breakdown.unmapped_round_labels) },
    { metric: "leadership", reason: "no participant on the initial round is flagged as lead", count: initialLead.no_lead_recorded },
    { metric: "leadership", reason: "investor's lead flag is null on the initial round", count: initialLead.unknown },
    { metric: "syndicates", reason: "initial round led (or co-led) by the investor", count: initialLead.led },
    { metric: "syndicates", reason: "no participant on the initial round is flagged as lead", count: initialLead.no_lead_recorded },
    { metric: "syndicates", reason: "investor's lead flag is null on the initial round", count: initialLead.unknown },
    { metric: "sectors", reason: "taxonomy not returned for company", count: sect.taxonomy_not_returned },
    { metric: "sectors", reason: "company has no industry tag", count: sect.without_industry },
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
      outside_portfolio_listing: history.roundsOutsidePortfolio.length,
      companies_without_any_round: companies.filter((c) => c.companyRoundsObserved === 0).length,
    },
    initial_investments: { identified: byStatus.initial_identified, flags },
    coverage: {
      initial_investment_identification: ratio(byStatus.initial_identified, companies.length),
      entry_stage: ratio(entry.known_stage, entry.companies_with_initial_investment),
      lead_status: initialLead.lead_status_coverage,
      sector: ratio(sect.companies - sect.taxonomy_not_returned - sect.without_industry, sect.companies),
    },
    exclusions: exclusions.filter((e) => e.count > 0),
  };
}

const sumValues = (record: Record<string, number>): number => Object.values(record).reduce((a, b) => a + b, 0);

