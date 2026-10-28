# Sheeply

Local-first CLI that profiles how a venture firm invests (entry stage, lead behaviour, syndicate concentration) from the Dealroom API. Shared project context, services and rules live in `../AGENTS.md`. Setup and usage are in README.md.

## Conventions

- **SQLite is a cache.** `raw_responses` holds what Dealroom returned; every other table is derived by `src/ingest/extract.ts` and must stay rebuildable with `sheeply db rebuild`. Change the mapping, bump `EXTRACTION_VERSION` in `src/version.ts`.
- **Metrics are pure functions** in `src/analysis/` over a `Dataset`. Change a metric, threshold or interpretation rule, bump `ALGORITHM_VERSION` and update `docs/methodology.md` in the same change.
- **No silent zeros.** Every share keeps its count and denominator, and anything not classified goes into `data_quality.exclusions` with a reason.
- **No look-ahead.** Describe an investment only with facts about that round. Current company status, valuation or later rounds never feed an entry metric.
- **Validate before trusting.** New Dealroom fields go into `src/dealroom/schemas.ts` and `docs/dealroom-field-mapping.md`, checked against `https://developers.dealroom.co/openapi.yaml`. Don't invent fields.
- **Deterministic output.** No timestamps or unordered iteration in the report; sort with explicit tie-breaks.

## Data and credentials

- Dealroom data is licensed. Never commit SQLite files, raw responses or real report output. Fixtures in `tests/fixtures/` are fictional.
- Credentials come from `DEALROOM_CLIENT_ID` and `DEALROOM_CLIENT_SECRET` (`.env` is gitignored). The current key is a beta key, so local runs need `DEALROOM_API_BASE_URL=https://api.beta.dealroom.app`.
- Live calls cost credits (about one per record). Prefer `--offline` against an existing cache, and `npm test`, which never calls the API.

## Development

- `npm test` runs unit tests (colocated `*.test.ts`) and `tests/integration/` against an in-memory fake Dealroom.
- `npm run calibrate -- --db <cache>` fetches any missing peer in `scripts/peers.ts` and regenerates `src/analysis/black-sheep-calibration.ts`. Rerun it whenever the black sheep observations or eligibility rules change. It costs about 30,000 credits from an empty cache.
- `npm run test:smoke` hits the live API for a dozen credits; it skips without credentials.
- Verify packaging with `npm pack` and `npx --package ./sheeply-<version>.tgz sheeply --version`. Never publish to npm without explicit approval.
