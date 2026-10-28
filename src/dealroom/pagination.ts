import type { z } from "zod";
import type { DealroomClient, DealroomResponse, QueryParams } from "./client.ts";
import { DealroomApiError } from "./client.ts";

interface CursorPage {
  data: unknown[];
  page: { next_cursor?: string | null };
}

export interface PageResult<T> extends DealroomResponse<T> {
  raw: unknown;
  pageIndex: number;
}

const MAX_PAGES = 10_000;

/**
 * Walks a `/data` list by cursor. The first request carries `limit`; later ones send the cursor
 * back with the same `filter` and `sort`, which the API requires to match the cursor's origin.
 */
export async function* walkPages<S extends z.ZodType<CursorPage>>(
  client: DealroomClient,
  endpoint: string,
  params: QueryParams,
  schema: S,
): AsyncGenerator<PageResult<z.infer<S>>> {
  const carried: QueryParams = { filter: params.filter, sort: params.sort, currency: params.currency };
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const request: QueryParams = cursor === null ? params : { ...carried, cursor };
    const response = await client.getValidated(endpoint, request, schema);
    yield { ...response, pageIndex };

    const next = response.body.page.next_cursor ?? null;
    if (next === null || response.body.data.length === 0) return;
    if (seen.has(next)) {
      throw new DealroomApiError(`Pagination on ${endpoint} returned a repeated cursor`, 200, "PAGINATION_LOOP", endpoint);
    }
    seen.add(next);
    cursor = next;
  }
  throw new DealroomApiError(`Pagination on ${endpoint} exceeded ${MAX_PAGES} pages`, 200, "PAGINATION_LIMIT", endpoint);
}
