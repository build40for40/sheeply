import { dataQuality } from "./data-quality.ts";
import { entryMaturity } from "./entry-maturity.ts";
import { interpret } from "./interpretation.ts";
import { buildInvestmentHistory } from "./investments.ts";
import { leadership } from "./leadership.ts";
import { sectors } from "./sectors.ts";
import { syndicates } from "./syndicates.ts";
import type { Dataset } from "./types.ts";

export type Analysis = ReturnType<typeof analyse>;

export function analyse(dataset: Dataset) {
  const history = buildInvestmentHistory(dataset);
  const entry = entryMaturity(history);
  const lead = leadership(history);
  const synd = syndicates(history);
  const sect = sectors(history, dataset.companies);
  const quality = dataQuality(dataset, history, { entry, leadership: lead, sectors: sect });
  return {
    history,
    entryMaturity: entry,
    leadership: lead,
    syndicates: synd,
    sectors: sect,
    dataQuality: quality,
    interpretation: interpret(entry, lead, synd, quality),
  };
}
