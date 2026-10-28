import type { Dataset, Round } from "../../src/analysis/types.ts";
import { INVESTOR, INVESTOR_DETAIL, PORTFOLIO, TRANSACTIONS } from "./dealroom.ts";

type FixtureRound = (typeof TRANSACTIONS)[number];

export function toRound(r: FixtureRound): Round {
  return {
    id: r.id,
    companyId: r.company.uuid,
    announcedDate: r.announced_date,
    roundLabel: r.round_label,
    standardizedRound: r.standardized_round,
    roundType: r.round_type,
    amount: r.amount,
    currency: "USD",
    isVcRound: r.is_vc_round,
    investorsDisclosed: r.investors !== null,
    participants: (r.investors ?? []).map((p) => ({
      id: p.investor.uuid,
      name: p.investor.name,
      type: p.investor.type,
      subtype: p.investor.subtype,
      isLead: p.is_lead,
    })),
  };
}

/** The fixture world as an analysis-ready dataset, bypassing the database. */
export function fixtureDataset(overrides: { rounds?: Round[]; portfolio?: Dataset["portfolio"] } = {}): Dataset {
  const companies: Dataset["companies"] = {};
  for (const row of PORTFOLIO) {
    companies[row.company.uuid] = {
      id: row.company.uuid,
      name: row.company.name,
      launchDate: row.company.launch_date,
      taxonomyKnown: true,
      taxonomy: row.company.taxonomy,
    };
  }
  return {
    investor: {
      id: INVESTOR.uuid,
      name: INVESTOR.name,
      type: "organization",
      subtype: "investor",
      firmTypes: ["venture capital"],
      launchDate: "2010",
      hqCountry: "Exampleland",
      dealroomUrl: null,
      reportedPortfolioTotal: INVESTOR_DETAIL.data.portfolio.companies.total,
      reportedRoundsCount: 9,
    },
    portfolio:
      overrides.portfolio ??
      PORTFOLIO.map((row) => ({
        companyId: row.company.uuid,
        companyName: row.company.name,
        companySubtype: row.company.subtype,
        roundsCount: row.rounds_count,
        isLeadAny: row.is_lead,
        lastRoundDate: row.last_round_date,
      })),
    companies,
    rounds: overrides.rounds ?? TRANSACTIONS.map(toRound),
    provenance: {
      runId: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:05.000Z",
      apiBaseUrl: "https://dealroom.test",
      apiVersion: "2026-10-22",
      roundsStrategy: "portfolio_transactions",
      extractionVersion: "1",
      responsesStored: 5,
      firstRetrievedAt: "2026-01-01T00:00:01.000Z",
      lastRetrievedAt: "2026-01-01T00:00:04.000Z",
      requests: 5,
      creditsUsed: 20,
      transactionsReportedTotal: TRANSACTIONS.length,
    },
  };
}

export function roundOf(dataset: Dataset, roundId: number): Round {
  const found = dataset.rounds.find((r) => r.id === roundId);
  if (!found) throw new Error(`fixture round ${roundId} missing`);
  return found;
}
