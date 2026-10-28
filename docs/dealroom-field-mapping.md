# Dealroom field mapping

How each Dealroom response field becomes a column in Sheeply's SQLite tables, and which analysis reads it. Verified against the OpenAPI spec at `https://developers.dealroom.co/openapi.yaml` (spec version `2026-10-22`) and live responses on 2026-10-28.

Sheeply pins `API-Version: 2026-10-22`. Every stored response keeps the `API-Version` header Dealroom applied, so a later spec change can be traced to the runs it affected.

## Endpoints used

| Purpose | Request | Page size | Notes |
| --- | --- | --- | --- |
| Name resolution | `GET /data/search?q=…&types=investor&limit=20` | 20 (max) | Free (0 credits). Returns relevance-ranked hits, `type` is `investor` for firms |
| Investor profile | `GET /data/investors/{uuid}` | n/a | 2 credits. Returns an investor firm **or** a person who invests (`type: person`) |
| Portfolio | `GET /data/investors/{uuid}/portfolio` | 500 (max) | 1 credit per row. One row per company, includes companies with `rounds_count: 0` |
| Funding history | `GET /data/transactions?filter=company_investor_id[in_any]:{uuid}&sort=date&include_total=true` | 500 | 1 credit per row. Every round of every company the investor backed, including rounds it did not join |
| Fallback history | `GET /data/companies/{uuid}/funding-rounds` | 500 (max) | Used only when the transactions filter answers 400, 403 or 404 |

All lists page by cursor: the first request sends `limit`, later ones send `cursor=<page.next_cursor>` with the same `filter` and `sort`. `offset` was retired in API version `2026-10-07`.

`company_investor_id` is the documented filter "Every round of the companies a specific investor has backed". It turns the whole funding history into a handful of calls (Seedcamp: 8 requests, 1,777 rounds) instead of one call per portfolio company.

## Raw storage

| Table | Holds |
| --- | --- |
| `ingestion_runs` | One row per fetch: investor, status (`running`, `complete`, `failed`), API host and version, strategy, requests, credits, error |
| `raw_responses` | Every response body verbatim, with endpoint, params, `retrieved_at`, `API-Version` header, `X-Credits-Used` and a SHA-256 of the body |

Everything below is derived from `raw_responses` by `src/ingest/extract.ts` (`EXTRACTION_VERSION = 1`).

## Investor (`/data/investors/{uuid}` → `investors`)

| Dealroom field | Column | Used for |
| --- | --- | --- |
| `data.uuid` | `uuid` | Identity |
| `data.name` | `name`, `name_key` | Report, offline name resolution |
| `data.type` (`organization` / `person`) | `type` | `investor.analysis_level` (firm or person) |
| `data.subtype` | `subtype` | Report |
| `data.types[].name` | `firm_types_json` | Report (e.g. `venture capital`) |
| `data.launch_date` | `launch_date` | Report |
| `data.locations[role=hq].country.name` | `hq_country` | Report |
| `data.portfolio.companies.total` | `reported_portfolio_total` | Portfolio completeness check |
| `data.portfolio.rounds_count` | `reported_rounds_count` | Stored for debugging |

Not used: `stages` (empty for the firms checked), `deal_size` (`{min: 0, max: 0}` for Seedcamp), `investments.preferred_round` (Dealroom's own summary, not reproducible from our data).

## Portfolio (`/portfolio` → `portfolio_relationships`, `companies`, `company_taxonomy`)

| Dealroom field | Column | Used for |
| --- | --- | --- |
| `company.uuid` | `company_id` | Join key |
| `company.subtype` | `company_subtype` | Excludes universities, gov/NGO and investors |
| `rounds_count` | `rounds_count` | `0` means a stake not attributed to any known round |
| `is_lead` | `is_lead_any` | Stored only. It means "led at least one round", too coarse for per-round analysis |
| `last_round_date` | `last_round_date` | Stored only |
| `company.name`, `launch_date`, `dealroom_url` | `companies.*` | Report |
| `company.taxonomy[]` (`id`, `name`, `type`) | `taxonomy_terms`, `company_taxonomy` | Sector exposure (`type = industry` only; no exclusive sector field exists) |
| `company.launch_date` | `companies.launch_date` | Company age at entry (year precision) |

## Funding rounds (`/data/transactions` → `funding_rounds`, `round_participants`, `entities`)

| Dealroom field | Column | Used for |
| --- | --- | --- |
| `id` (integer) | `id` | Dedup key across pages, runs and investors |
| `company.uuid` | `company_id` | Join to portfolio |
| `announced_date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`) | `announced_date` | Ordering rounds. Precision is kept, never padded |
| `round_label` | `round_label` | **Entry maturity**. Dealroom's own stage label; null when no stage definition is met |
| `standardized_round` | `standardized_round` | Reported alongside, never used to fill a missing `round_label` |
| `round_type` | `round_type` | Self-reported name, stored for debugging only |
| `amount`, `valuation` + envelope `currency` | `amount`, `valuation`, `currency` | Prior VC capital at entry (disclosed amounts only). `0` and `null` are kept distinct |
| `is_vc_round` | `is_vc_round` | Entry position and prior VC capital (which company rounds count as VC rounds before the entry) |
| `is_exit` | `is_exit` | Stored only |
| `investors` (`null` vs `[]`) | `investors_disclosed` | `null` is a tier redaction, not an empty round |
| `investors[].investor` (`EntityRef`) | `entities` | Participant identity and type (`organization` / `person`) |
| `investors[].is_lead` (`true` / `false` / `null`) | `round_participants.is_lead` (1 / 0 / NULL) | **Leadership** and **syndicates** |
| `deleted_at` | | Rows with a value are skipped |
| `source_url` | `source_url` | Stored for debugging |

`investor_round_scope` records which rounds belong to each investor's latest run, so rounds Dealroom stops returning drop out of that investor's analysis on `--refresh`.

## Field names from older schemas

| Older field | Current field |
| --- | --- |
| `lead` | `is_lead` |
| `year`, `month` on transactions | `announced_date` (since `2026-10-15`) |
| `offset` pagination | `cursor` (since `2026-10-07`) |
| `tags` | `taxonomy` |
| `organization_subtype` | `subtype` |

Sheeply only reads the current names. Pinning an older `API-Version` would fail schema validation rather than silently map fields.
