export interface Participant {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  /** `null` when Dealroom does not know whether this participant led. */
  isLead: boolean | null;
}

export interface Round {
  id: number;
  companyId: string;
  announcedDate: string | null;
  roundLabel: string | null;
  standardizedRound: string | null;
  roundType: string | null;
  amount: number | null;
  currency: string | null;
  isVcRound: boolean | null;
  /** False when Dealroom returned `investors: null`, which is a redaction, not an empty round. */
  investorsDisclosed: boolean;
  participants: Participant[];
}

export interface PortfolioEntry {
  companyId: string;
  companyName: string;
  companySubtype: string | null;
  roundsCount: number;
  isLeadAny: boolean;
  lastRoundDate: string | null;
}

export interface TaxonomyTerm {
  id: number;
  name: string;
  type: string;
}

export interface Company {
  id: string;
  name: string;
  launchDate: string | null;
  taxonomyKnown: boolean;
  taxonomy: TaxonomyTerm[];
}

export interface Investor {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  firmTypes: string[];
  launchDate: string | null;
  hqCountry: string | null;
  dealroomUrl: string | null;
  reportedPortfolioTotal: number | null;
  reportedRoundsCount: number | null;
}

export interface Provenance {
  runId: number;
  startedAt: string;
  finishedAt: string;
  apiBaseUrl: string;
  apiVersion: string;
  roundsStrategy: string;
  extractionVersion: string;
  responsesStored: number;
  firstRetrievedAt: string;
  lastRetrievedAt: string;
  requests: number | null;
  creditsUsed: number | null;
  transactionsReportedTotal: number | null;
}

export interface Dataset {
  investor: Investor;
  portfolio: PortfolioEntry[];
  companies: Record<string, Company>;
  rounds: Round[];
  provenance: Provenance;
}
