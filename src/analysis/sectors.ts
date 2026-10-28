import { compareStrings } from "../util.ts";
import type { InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import { ratio } from "./ratio.ts";
import type { Company } from "./types.ts";

export const SECTOR_FAMILY = "industry";

export interface Sectors {
  family: typeof SECTOR_FAMILY;
  basis: "companies_with_initial_investment";
  companies: number;
  taxonomy_not_returned: number;
  without_industry: number;
  with_multiple_industries: number;
  distribution: { id: number; name: string; companies: number; share: number | null }[];
}

/**
 * Industry mix of the companies behind the analysed investments. A company can carry two
 * industries, so it counts once in each and shares can sum past one. This is Dealroom's current
 * classification of the company, not its classification at the time of investment.
 */
export function sectors(history: InvestmentHistory, companies: Record<string, Company>): Sectors {
  const analysed = identified(history).map((c) => companies[c.companyId]);
  const counts = new Map<number, { name: string; companies: number }>();
  let notReturned = 0;
  let without = 0;
  let multiple = 0;

  for (const company of analysed) {
    if (!company || !company.taxonomyKnown) {
      notReturned++;
      continue;
    }
    const industries = company.taxonomy.filter((term) => term.type === SECTOR_FAMILY);
    if (industries.length === 0) without++;
    if (industries.length > 1) multiple++;
    for (const term of industries) {
      const entry = counts.get(term.id) ?? { name: term.name, companies: 0 };
      entry.companies++;
      counts.set(term.id, entry);
    }
  }

  return {
    family: SECTOR_FAMILY,
    basis: "companies_with_initial_investment",
    companies: analysed.length,
    taxonomy_not_returned: notReturned,
    without_industry: without,
    with_multiple_industries: multiple,
    distribution: [...counts]
      .sort(([idA, a], [idB, b]) => b.companies - a.companies || compareStrings(a.name, b.name) || idA - idB)
      .map(([id, entry]) => ({ id, name: entry.name, companies: entry.companies, share: ratio(entry.companies, analysed.length) })),
  };
}
