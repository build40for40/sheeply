import { z } from "zod";

/**
 * Validation for the Dealroom responses Sheeply reads, checked against the OpenAPI spec for
 * API version 2026-10-22. Only fields the analysis uses are declared; unknown fields pass through
 * untouched because the raw body is stored separately. See docs/dealroom-field-mapping.md.
 */

export const partialDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "expected YYYY, YYYY-MM or YYYY-MM-DD");

export const entityRef = z.object({
  uuid: z.string().min(1),
  type: z.enum(["organization", "person"]),
  subtype: z.string().nullable().optional(),
  name: z.string(),
  dealroom_url: z.string().nullable().optional(),
});

export const taxonomyTerm = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
});

const location = z.object({
  role: z.string(),
  city: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
  country: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
});

export const organizationSummary = z.object({
  uuid: z.string().min(1),
  name: z.string(),
  type: z.string().optional(),
  subtype: z.string().nullable().optional(),
  launch_date: partialDate.nullable().optional(),
  dealroom_url: z.string().nullable().optional(),
  taxonomy: z.array(taxonomyTerm).optional(),
  locations: z.array(location).optional(),
});

export const page = z.object({
  next_cursor: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  tier: z.string().nullable().optional(),
  capped: z.boolean().nullable().optional(),
  result_cap: z.number().nullable().optional(),
});

export const roundInvestor = z.object({
  is_lead: z.boolean().nullable(),
  investor: entityRef,
});

/** One row of `/data/companies/{id}/funding-rounds`: a transaction without its `company`. */
export const companyRound = z.object({
  id: z.number().int(),
  amount: z.number().nullable(),
  announced_date: partialDate.nullable(),
  round_type: z.string().nullable(),
  standardized_round: z.string().nullable(),
  round_label: z.string().nullable().optional(),
  valuation: z.number().nullable().optional(),
  is_vc_round: z.boolean().nullable(),
  is_exit: z.boolean().nullable().optional(),
  investors: z.array(roundInvestor).nullable(),
  source_url: z.string().nullable().optional(),
});

/** One row of `/data/transactions`. */
export const transaction = companyRound.extend({
  company: organizationSummary,
  deleted_at: z.string().nullable().optional(),
});

export const searchResponse = z.object({
  data: z.array(
    z.object({
      uuid: z.string().min(1),
      type: z.string(),
      name: z.string(),
      tagline: z.string().nullable().optional(),
      investor_rank: z.number().nullable().optional(),
      website_domain: z.string().nullable().optional(),
      hq_city: z.string().nullable().optional(),
      hq_country: z.string().nullable().optional(),
    }),
  ),
});

const namedCode = z.object({ id: z.number(), name: z.string(), code: z.string().optional() });

/** `/data/investors/{id}` returns either an investor firm or a person who invests. */
export const investorDetailResponse = z.object({
  data: z.object({
    uuid: z.string().min(1),
    name: z.string(),
    type: z.enum(["organization", "person"]),
    subtype: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    dealroom_url: z.string().nullable().optional(),
    launch_date: partialDate.nullable().optional(),
    roles: z.array(z.string()).optional(),
    types: z.array(namedCode).optional(),
    locations: z.array(location).optional(),
    investments: z
      .object({
        count: z.number().nullable().optional(),
        preferred_round: z.string().nullable().optional(),
        last_round_date: partialDate.nullable().optional(),
      })
      .nullable()
      .optional(),
    portfolio: z
      .object({
        rounds_count: z.number().nullable().optional(),
        companies: z.object({ total: z.number().nullable().optional() }).nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
});

export const portfolioResponse = z.object({
  data: z.array(
    z.object({
      is_lead: z.boolean(),
      rounds_count: z.number().int(),
      last_round_date: partialDate.nullable(),
      company: organizationSummary,
    }),
  ),
  page,
});

export const transactionsResponse = z.object({ data: z.array(transaction), page, currency: z.string().optional() });

export const companyRoundsResponse = z.object({ data: z.array(companyRound), page, currency: z.string().optional() });

export const errorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type SearchResponse = z.infer<typeof searchResponse>;
export type SearchHit = SearchResponse["data"][number];
export type InvestorDetailResponse = z.infer<typeof investorDetailResponse>;
export type PortfolioResponse = z.infer<typeof portfolioResponse>;
export type TransactionsResponse = z.infer<typeof transactionsResponse>;
export type CompanyRoundsResponse = z.infer<typeof companyRoundsResponse>;
export type Transaction = z.infer<typeof transaction>;
export type CompanyRound = z.infer<typeof companyRound>;
export type OrganizationSummary = z.infer<typeof organizationSummary>;
export type EntityRef = z.infer<typeof entityRef>;
