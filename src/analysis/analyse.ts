import { dataQuality } from "./data-quality.ts";
import { entryMaturity } from "./entry-maturity.ts";
import { interpret } from "./interpretation.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { investmentLeadership } from "./leadership.ts";
import { sectorExposure } from "./sector-exposure.ts";
import { syndicates } from "./syndicates.ts";
import type { Dataset } from "./types.ts";

export type Analysis = ReturnType<typeof analyse>;

/**
 * Two metrics and two descriptive outputs, each computed independently from the same investment
 * history. The black sheep score is not one of them: it ranks an investor against stored peers, so
 * it lives in `black-sheep.ts` and is computed by the caller that has the peer set.
 */
export function analyse(dataset: Dataset) {
  const history = buildInvestmentHistory(dataset);
  const entry = entryMaturity(history);
  const leadership = investmentLeadership(history);
  const sectors = sectorExposure(history, dataset.companies);
  const quality = dataQuality(dataset, history, { entry, leadership, sectors });
  return {
    history,
    entryMaturity: entry,
    investmentLeadership: leadership,
    sectorExposure: sectors,
    syndicateRelationships: syndicates(history),
    dataQuality: quality,
    interpretation: interpret(entry, leadership, quality),
  };
}
