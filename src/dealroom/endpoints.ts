import type { DealroomClient } from "./client.ts";
import { walkPages } from "./pagination.ts";
import {
  companyRoundsResponse,
  investorDetailResponse,
  portfolioResponse,
  searchResponse,
  transactionsResponse,
} from "./schemas.ts";

export const PORTFOLIO_PAGE_SIZE = 500;
export const TRANSACTIONS_PAGE_SIZE = 500;
export const COMPANY_ROUNDS_PAGE_SIZE = 500;
export const SEARCH_LIMIT = 20;

export const searchInvestors = (client: DealroomClient, query: string) =>
  client.getValidated("/data/search", { q: query, types: "investor", limit: SEARCH_LIMIT }, searchResponse);

export const getInvestor = (client: DealroomClient, id: string) =>
  client.getValidated(`/data/investors/${encodeURIComponent(id)}`, {}, investorDetailResponse);

export const portfolioPages = (client: DealroomClient, id: string) =>
  walkPages(client, `/data/investors/${encodeURIComponent(id)}/portfolio`, { limit: PORTFOLIO_PAGE_SIZE }, portfolioResponse);

/** Every round of every company the investor has backed, including rounds it did not join. */
export const portfolioTransactionPages = (client: DealroomClient, id: string) =>
  walkPages(
    client,
    "/data/transactions",
    {
      filter: `company_investor_id[in_any]:${id}`,
      sort: "date",
      limit: TRANSACTIONS_PAGE_SIZE,
      include_total: true,
    },
    transactionsResponse,
  );

export const companyRoundPages = (client: DealroomClient, companyId: string) =>
  walkPages(
    client,
    `/data/companies/${encodeURIComponent(companyId)}/funding-rounds`,
    { limit: COMPANY_ROUNDS_PAGE_SIZE },
    companyRoundsResponse,
  );
