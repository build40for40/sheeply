import { compareStrings } from "../util.ts";
import type { InvestmentHistory } from "./investments.ts";
import { identified } from "./investments.ts";
import { ratio } from "./ratio.ts";
import type { Company } from "./types.ts";

export const SECTOR_FAMILY = "industry";

export interface SectorExposure {
  role: "descriptive";
  question: "Which sectors does this investor enter?";
  classification: {
    exclusive_sector_classification_available: false;
    family: typeof SECTOR_FAMILY;
    note: string;
    max_labels_per_company_observed: number;
  };
  first_investments: number;
  taxonomy_not_returned: number;
  without_industry: number;
  /** Companies with at least one industry label: the denominator of every share below. */
  labelled: number;
  with_multiple_industries: number;
  label_assignments: number;
  distribution: { id: number; name: string; companies: number; share: number | null }[];
  breadth: {
    distinct_industries: number;
    top_industry_share: number | null;
    /** 1 / Σ w², where each company splits a weight of 1 equally across its industries. */
    effective_number_of_industries: number | null;
  };
}

/**
 * Multi-label industry exposure of the companies behind the first investments. Dealroom exposes no
 * mutually exclusive sector field, so a company with two industries counts in both and shares can
 * sum past one. This is the company's current classification, not the one at investment time.
 */
export function sectorExposure(history: InvestmentHistory, companies: Record<string, Company>): SectorExposure {
  const analysed = identified(history).map((c) => companies[c.companyId]);
  const counts = new Map<number, { name: string; companies: number; weight: number }>();
  let notReturned = 0;
  let without = 0;
  let multiple = 0;
  let assignments = 0;
  let maxLabels = 0;

  for (const company of analysed) {
    if (!company || !company.taxonomyKnown) {
      notReturned++;
      continue;
    }
    const industries = company.taxonomy.filter((term) => term.type === SECTOR_FAMILY);
    if (industries.length === 0) without++;
    if (industries.length > 1) multiple++;
    assignments += industries.length;
    maxLabels = Math.max(maxLabels, industries.length);
    for (const term of industries) {
      const entry = counts.get(term.id) ?? { name: term.name, companies: 0, weight: 0 };
      entry.companies++;
      entry.weight += 1 / industries.length;
      counts.set(term.id, entry);
    }
  }

  const labelled = analysed.length - notReturned - without;
  const distribution = [...counts]
    .sort(([idA, a], [idB, b]) => b.companies - a.companies || compareStrings(a.name, b.name) || idA - idB)
    .map(([id, entry]) => ({ id, name: entry.name, companies: entry.companies, share: ratio(entry.companies, labelled) }));
  const concentration = [...counts.values()].reduce((sum, entry) => sum + (entry.weight / labelled) ** 2, 0);

  return {
    role: "descriptive",
    question: "Which sectors does this investor enter?",
    classification: {
      exclusive_sector_classification_available: false,
      family: SECTOR_FAMILY,
      note: "Dealroom's API exposes no mutually exclusive sector field. Industry is its highest-level classification and a company can hold two, so shares can sum past 100%.",
      max_labels_per_company_observed: maxLabels,
    },
    first_investments: analysed.length,
    taxonomy_not_returned: notReturned,
    without_industry: without,
    labelled,
    with_multiple_industries: multiple,
    label_assignments: assignments,
    distribution,
    breadth: {
      distinct_industries: counts.size,
      top_industry_share: distribution[0]?.share ?? null,
      effective_number_of_industries: labelled === 0 ? null : Math.round((1 / concentration) * 100) / 100,
    },
  };
}
