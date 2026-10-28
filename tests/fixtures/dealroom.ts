/**
 * A small, entirely fictional Dealroom-shaped world. Names, ids and figures are made up; the
 * shapes follow the 2026-10-22 OpenAPI spec so the same payloads drive unit and integration tests.
 */

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const INVESTOR = { uuid: id(1), name: "Example Ventures" };
export const LEAD_ONE = { uuid: id(901), name: "Northwind Capital" };
export const LEAD_TWO = { uuid: id(902), name: "Blue Harbour Partners" };
export const ANGEL = { uuid: id(903), name: "Pat Example", type: "person" as const };
export const CO_INVESTOR = { uuid: id(904), name: "Orchard Seed Fund" };

type Ref = { uuid: string; name: string; type?: "organization" | "person" };

export const ref = (entity: Ref) => ({
  uuid: entity.uuid,
  type: entity.type ?? "organization",
  subtype: entity.type === "person" ? null : "investor",
  name: entity.name,
  image: null,
  dealroom_url: null,
});

export const participant = (entity: Ref, isLead: boolean | null) => ({ is_lead: isLead, investor: ref(entity) });

export const term = (termId: number, name: string, type: string) => ({ id: termId, name, type });

export function company(n: number, name: string, options: { subtype?: string; taxonomy?: ReturnType<typeof term>[] } = {}) {
  return {
    uuid: id(n),
    type: "organization",
    subtype: options.subtype ?? "company",
    name,
    launch_date: "2016-05",
    dealroom_url: null,
    taxonomy: options.taxonomy ?? [],
    locations: [],
  };
}

export function round(
  roundId: number,
  companyRef: ReturnType<typeof company>,
  fields: {
    date: string | null;
    label: string | null;
    standardized: string | null;
    investors: ReturnType<typeof participant>[] | null;
    amount?: number | null;
  },
) {
  return {
    id: roundId,
    amount: fields.amount ?? 1_000_000,
    announced_date: fields.date,
    round_type: fields.standardized?.toUpperCase() ?? null,
    standardized_round: fields.standardized,
    round_label: fields.label,
    valuation: null,
    is_verified: true,
    is_vc_round: true,
    is_exit: false,
    company: companyRef,
    investors: fields.investors,
    source_url: null,
    deleted_at: null,
  };
}

export const INDUSTRY_ROBOTICS = term(1003, "Robotics", "industry");
export const INDUSTRY_SOFTWARE = term(2003, "Enterprise Software", "industry");
export const INDUSTRY_HEALTH = term(3003, "Health", "industry");
export const INDUSTRY_FINTECH = term(4003, "Fintech", "industry");
export const SECTOR_ROBOTICS = term(5001, "robotics", "sector");

export const COMPANIES = {
  acme: company(101, "Acme Robotics", { taxonomy: [INDUSTRY_ROBOTICS, INDUSTRY_SOFTWARE, SECTOR_ROBOTICS] }),
  bramble: company(102, "Bramble Health", { taxonomy: [INDUSTRY_HEALTH] }),
  copper: company(103, "Copper Pay", { taxonomy: [INDUSTRY_FINTECH] }),
  delta: company(104, "Delta Data", { taxonomy: [SECTOR_ROBOTICS] }),
  echo: company(105, "Echo Labs", { taxonomy: [INDUSTRY_SOFTWARE] }),
  foxtrot: company(106, "Foxtrot University", { subtype: "university" }),
  gamma: company(107, "Gamma AI", { taxonomy: [INDUSTRY_SOFTWARE] }),
  halo: company(108, "Halo Bio", { taxonomy: [INDUSTRY_HEALTH] }),
};

const C = COMPANIES;

export const TRANSACTIONS = [
  round(11, C.acme, { date: "2018-03", label: "PRE-SEED", standardized: "Pre-Seed", investors: [participant(INVESTOR, true), participant(ANGEL, false)] }),
  round(12, C.acme, {
    date: "2019-06",
    label: "SEED",
    standardized: "Seed",
    investors: [participant(LEAD_ONE, true), participant(INVESTOR, false), participant(CO_INVESTOR, false)],
  }),
  round(13, C.acme, { date: "2021", label: "SERIES A", standardized: "Series A", investors: [participant(LEAD_TWO, true)] }),
  round(21, C.bramble, {
    date: "2019-02",
    label: "MICRO-SEED",
    standardized: "Seed",
    investors: [participant(LEAD_ONE, true), participant(INVESTOR, false), participant(CO_INVESTOR, false)],
  }),
  round(22, C.bramble, {
    date: "2020-05",
    label: "SERIES A",
    standardized: "Series A",
    investors: [participant(LEAD_TWO, true), participant(INVESTOR, false)],
  }),
  round(31, C.copper, {
    date: "2020-01",
    label: null,
    standardized: "Seed",
    investors: [participant(INVESTOR, false), participant(CO_INVESTOR, false)],
  }),
  round(41, C.delta, { date: "2017", label: null, standardized: "Growth", investors: [participant(INVESTOR, null)] }),
  round(71, C.gamma, { date: "2022-09", label: "SEED", standardized: "Seed", investors: [participant(LEAD_TWO, true)] }),
  round(81, C.halo, {
    date: "2022-04",
    label: "SEED",
    standardized: "Seed",
    investors: [participant(LEAD_ONE, true), participant(INVESTOR, true), participant(ANGEL, false)],
  }),
];

const portfolioRow = (c: ReturnType<typeof company>, roundsCount: number, isLead: boolean, last: string | null) => ({
  is_lead: isLead,
  rounds_count: roundsCount,
  last_round_date: last,
  company: c,
});

export const PORTFOLIO = [
  portfolioRow(C.acme, 2, true, "2019"),
  portfolioRow(C.bramble, 2, false, "2020"),
  portfolioRow(C.copper, 1, false, "2020"),
  portfolioRow(C.delta, 1, false, "2017"),
  portfolioRow(C.echo, 0, false, null),
  portfolioRow(C.foxtrot, 0, false, null),
  portfolioRow(C.gamma, 1, false, "2022"),
  portfolioRow(C.halo, 1, true, "2022"),
];

export const INVESTOR_DETAIL = {
  data: {
    uuid: INVESTOR.uuid,
    type: "organization",
    subtype: "investor",
    name: INVESTOR.name,
    domain: "example.invalid",
    dealroom_url: null,
    launch_date: "2010",
    roles: ["investor"],
    types: [{ id: 113, name: "venture capital", code: "venture_capital" }],
    locations: [{ role: "hq", city: { id: 1, name: "Exampleton" }, country: { id: 2, name: "Exampleland" } }],
    investments: { count: 9, preferred_round: "SEED", last_round_date: "2022-04" },
    portfolio: { rounds_count: 9, companies: { total: PORTFOLIO.length, sort: "-last_round_date", items: [] } },
  },
  currency: "USD",
};

export const SEARCH_HITS = [
  { uuid: INVESTOR.uuid, type: "investor", entity_type: "organization", name: INVESTOR.name, website_domain: "example.invalid", hq_city: "Exampleton", hq_country: "Exampleland", investor_rank: 10 },
  { uuid: id(2), type: "investor", entity_type: "organization", name: "Example Ventures Japan", website_domain: null, hq_city: null, hq_country: null, investor_rank: 500 },
  { uuid: id(3), type: "investor", entity_type: "organization", name: "Sample Capital", website_domain: null, hq_city: "Sampleton", hq_country: null, investor_rank: 50 },
  { uuid: id(4), type: "investor", entity_type: "organization", name: "Sample Capital", website_domain: "sample.invalid", hq_city: null, hq_country: "Exampleland", investor_rank: 60 },
];

/** Rounds per company in the slimmer `/funding-rounds` shape, for the per-company fallback. */
export function companyRounds(companyId: string) {
  return TRANSACTIONS.filter((r) => r.company.uuid === companyId).map(({ company: _company, deleted_at: _deleted, ...rest }) => rest);
}
