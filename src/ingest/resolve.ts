import type { DealroomClient } from "../dealroom/client.ts";
import { searchInvestors } from "../dealroom/endpoints.ts";
import type { SearchHit } from "../dealroom/schemas.ts";
import type { Database } from "../db/database.ts";
import { nameKey } from "../util.ts";

export interface Candidate {
  id: string;
  name: string;
  location: string | null;
  domain: string | null;
  rank: number | null;
}

export interface Resolution {
  id: string;
  name: string;
  via: "investor_id" | "local_exact_name" | "search_exact_name" | "interactive_choice";
}

export class InvestorResolutionError extends Error {
  override name = "InvestorResolutionError";
  readonly candidates: Candidate[];

  constructor(message: string, candidates: Candidate[] = []) {
    super(message);
    this.candidates = candidates;
  }
}

export type Chooser = (query: string, candidates: Candidate[]) => Promise<Candidate | null>;

const fromHit = (hit: SearchHit): Candidate => ({
  id: hit.uuid,
  name: hit.name,
  location: [hit.hq_city, hit.hq_country].filter(Boolean).join(", ") || null,
  domain: hit.website_domain ?? null,
  rank: hit.investor_rank ?? null,
});

/**
 * Only an exact name match is ever chosen automatically. Anything else is ambiguous: the caller
 * either asks the user or fails with the candidate list, never guesses from relevance order.
 */
export function matchCandidates(query: string, candidates: Candidate[]): { match: Candidate } | { ambiguous: Candidate[] } {
  const key = nameKey(query);
  const exact = candidates.filter((candidate) => nameKey(candidate.name) === key);
  if (exact.length === 1) return { match: exact[0]! };
  return { ambiguous: exact.length > 1 ? exact : candidates };
}

export function localCandidates(db: Database, query: string): Candidate[] {
  return db
    .prepare("SELECT uuid, name, hq_country, domain FROM investors WHERE name_key = ? ORDER BY name, uuid")
    .all(nameKey(query))
    .map((row) => ({
      id: String(row.uuid),
      name: String(row.name),
      location: row.hq_country == null ? null : String(row.hq_country),
      domain: row.domain == null ? null : String(row.domain),
      rank: null,
    }));
}

export interface ResolveOptions {
  db: Database;
  query?: string;
  investorId?: string;
  offline: boolean;
  client?: () => DealroomClient;
  choose?: Chooser;
}

export async function resolveInvestor(options: ResolveOptions): Promise<Resolution> {
  const { db, query, investorId, offline } = options;
  if (investorId) {
    const local = db.prepare("SELECT name FROM investors WHERE uuid = ?").get(investorId);
    return { id: investorId, name: local ? String(local.name) : investorId, via: "investor_id" };
  }
  if (!query?.trim()) throw new InvestorResolutionError("Give an investor name or --investor-id <uuid>.");

  const local = localCandidates(db, query);
  if (local.length === 1) return { id: local[0]!.id, name: local[0]!.name, via: "local_exact_name" };
  if (offline) {
    if (local.length === 0) {
      throw new InvestorResolutionError(`No stored investor is named "${query}". Run once without --offline to fetch it.`);
    }
    return choose(options, query, local);
  }

  if (!options.client) throw new InvestorResolutionError("No Dealroom client available for investor search.");
  const { body } = await searchInvestors(options.client(), query);
  const hits = body.data.filter((hit) => hit.type === "investor").map(fromHit);
  if (hits.length === 0) throw new InvestorResolutionError(`Dealroom has no investor matching "${query}".`);

  const result = matchCandidates(query, hits);
  if ("match" in result) return { id: result.match.id, name: result.match.name, via: "search_exact_name" };
  return choose(options, query, result.ambiguous);
}

async function choose(options: ResolveOptions, query: string, candidates: Candidate[]): Promise<Resolution> {
  const chosen = options.choose ? await options.choose(query, candidates) : null;
  if (chosen) return { id: chosen.id, name: chosen.name, via: "interactive_choice" };
  throw new InvestorResolutionError(
    `"${query}" matches more than one investor, or none exactly. Rerun with --investor-id <uuid>.`,
    candidates,
  );
}
