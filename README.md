# Sheeply

Does a venture firm back its own conviction, take early risk, or mostly tag along on rounds other people lead? Sheeply pulls a firm's portfolio and funding history from the [Dealroom API](https://developers.dealroom.co/), caches it in a local SQLite file and prints a transparent JSON profile:

- **Entry maturity** (metric): the stage of each first investment (pre-seed, seed, Series A, Series B+, unknown), with company age, prior capital and entry position as unscored context.
- **Investment leadership** (metric): how often the firm is recorded as lead on its first investments, with the denominator and how complete Dealroom's lead data is.
- **Sector exposure** (descriptive): multi-label industry mix of those companies.
- **Syndicate relationships** (descriptive): who led the rounds the firm joined, and who it keeps co-investing with.
- **Data quality and a rule-based interpretation**, with every threshold and exclusion spelled out.
- **Black sheep score** (0-100): how often the firm leads or goes in first rather than following, ranked against a versioned set of early-stage peers, with a range and the counts behind it.

The metrics stay separate so correlated signals are not counted twice; the black sheep score is the one composite and says which peers it was ranked against. No LLM, no server. A research tool, built as dry run #1 for [40 for 40](https://build40for40.com).

## Quick start

Needs Node.js 22.13 or later (SQLite comes built in, nothing native to compile) and a Dealroom API key.

```bash
git clone https://github.com/build40for40/sheeply.git
cd sheeply
npm install
cp .env.example .env   # then fill in DEALROOM_CLIENT_ID and DEALROOM_CLIENT_SECRET
npm run build
node dist/cli/index.js "Seedcamp"
```

Or straight from a packed tarball, without cloning:

```bash
npm pack                                   # in this repo, makes sheeply-0.1.0.tgz
npx --package ./sheeply-0.1.0.tgz sheeply "Seedcamp"
```

Once published, it will be `npx sheeply "Seedcamp"`.

## Dealroom credentials

A Dealroom API key is a **client id and secret pair**, not a single token. Create one under API settings in Dealroom, then either put them in `.env` in the directory you run from, or export them:

```bash
export DEALROOM_CLIENT_ID=…
export DEALROOM_CLIENT_SECRET=…
```

Sheeply swaps them for a 24 hour Bearer token and sends it with `X-Client-Id` and a pinned `API-Version` on every request.

| Variable | Default | |
| --- | --- | --- |
| `DEALROOM_CLIENT_ID`, `DEALROOM_CLIENT_SECRET` | | Required unless `--offline` |
| `DEALROOM_API_BASE_URL` | `https://api.dealroom.app` | Keys issued during the open beta need `https://api.beta.dealroom.app` |
| `DEALROOM_AUDIENCE` | the base URL | OAuth audience |
| `DEALROOM_TOKEN_URL` | `https://accounts.dealroom.co/oauth/token` | |
| `DEALROOM_API_VERSION` | `2026-10-22` | Date-pinned API version |
| `DEALROOM_REQUESTS_PER_SECOND` | `4` | Dealroom allows 5 per key |
| `DEALROOM_TIMEOUT_MS` | `60000` | Per request |
| `SHEEPLY_DB` | `./sheeply.sqlite` | Cache location |

**Credits:** Dealroom charges about one credit per record returned. Seedcamp (523 companies, 1,777 rounds) costs about 2,300 credits on first fetch; later runs reuse the cache for free.

## Usage

```bash
sheeply "Seedcamp"                                  # resolve, fetch if not cached, draw the black sheep
sheeply "Seedcamp" --format json                    # the full report as JSON
sheeply "Index Ventures" --format json --verbose    # add the per-company rounds behind every metric
sheeply "LocalGlobe" --format json --output ./results/lg.json   # write to a file
sheeply --investor-id a9d89ae3-22df-49b8-9fb6-57ad8701973d   # exact id, for reproducibility
sheeply "Seedcamp" --refresh                        # fetch again even though it is cached
sheeply "Seedcamp" --offline                        # never call Dealroom
sheeply "Seedcamp" --db ./research.sqlite           # use another cache file
sheeply db status                                   # what is cached
sheeply db rebuild                                  # re-derive every table from stored responses
```

Progress goes to stderr and the report to stdout, so `sheeply "Seedcamp" --format json | jq .black_sheep_score` works.

**Name resolution.** Sheeply only picks a name automatically when exactly one Dealroom investor matches it exactly (ignoring case, accents and punctuation). Anything else asks you to choose in a terminal, or fails with the candidate list and their `--investor-id` values when there is no terminal or you pass `--no-interactive`. Exit codes: `2` for usage or ambiguity, `3` for Dealroom API errors.

**Output format.** By default sheeply draws an ASCII sheep whose fleece thins as the investor's 0-100 black sheep score rises: a full white fleece follows the flock, an empty outline is the true black sheep. The score ranks the investor against peer figures built into the package, so nothing else is fetched. When the investor has too little data to score, it explains why and exits with code `2`. `--format json` prints the full report, whose shape is versioned by `report_schema_version`.

## The report

```jsonc
// Shape only; values are illustrative.
{
  "tool":   { "algorithm_version": "0.3.0", "extraction_version": "1", … },
  "source": { "api_version": "2026-10-22", "retrieval_finished_at": "…", "credits_used": 1234, "dataset_fingerprint": "sha256:…" },
  "investor": { "name": "Example Ventures", "analysis_level": "firm", … },
  "coverage": { "portfolio_companies_returned": 300, "first_investments_identified": 270, … },
  "black_sheep_score":       { "role": "score", "value": 42, "range": { "low": 30, "high": 55, … }, "components": { "leads": { … }, "independent_entry": { … } }, "calibration": { "peer_set_version": "…", … } },
  "entry_maturity":          { "role": "metric", "distribution": { "seed": { "count": 120, "share": 0.44, "share_of_known_stage": 0.6 }, "unknown": { … }, … }, "explanatory_attributes": { … } },
  "investment_leadership":   { "role": "metric", "initial_investments": { "lead_rate": { "numerator": 40, "denominator": 100, "value": 0.4 }, "lead_status_completeness": { … }, … } },
  "sector_exposure":         { "role": "descriptive", "labelled": 260, "distribution": [ … ], "breadth": { … } },
  "syndicate_relationships": { "role": "descriptive", "lead_partners": { … }, "co_investors": { … } },
  "data_quality":   { "coverage": { … }, "lead_flags": { … }, "exclusions": [ { "output": "investment_leadership", "reason": "…", "count": 170 } ] },
  "interpretation": { "thresholds": { … }, "statements": [ { "rule": "investment_leadership.led_minority", "statement": "…", "evidence": { … } } ] },
  "contributions":  [ /* --verbose only */ ]
}
```

The same stored data and algorithm version always produce byte-identical output. How each number is calculated, and what is excluded, is in [docs/methodology.md](docs/methodology.md). Which Dealroom field feeds which column is in [docs/dealroom-field-mapping.md](docs/dealroom-field-mapping.md). Known API gaps and open questions are in [docs/api-limitations.md](docs/api-limitations.md).

## How it works

```text
Dealroom API ──► raw_responses (verbatim JSON, per run) ──► derived tables ──► analysis ──► JSON report
  search            ingestion_runs (status, version,          investors          pure functions,
  investor          credits, timestamps)                      companies          no I/O
  portfolio                                                   funding_rounds
  transactions                                                round_participants …
```

SQLite is a cache, not the source of truth. Dealroom plus the versioned extraction (`src/ingest/extract.ts`) and calculation (`src/analysis/`) are. Delete the file and run again to rebuild everything from the API; run `sheeply db rebuild` to re-derive every table from the stored responses without calling the API. Raw responses stay in your local file: they are Dealroom's licensed data and are never committed or packaged.

```text
src/
  cli/         commander program, analyse and db commands
  dealroom/    client (auth, retries, rate limit), zod schemas, cursor pagination, endpoints
  db/          SQLite schema and migrations (node:sqlite)
  ingest/      investor resolution, fetch into raw_responses, extraction into tables
  analysis/    investment history, entry maturity, leadership, sector exposure, syndicates, data quality, interpretation
  reports/     JSON report
tests/
  fixtures/    a small fictional Dealroom world and an in-memory fake API
  integration/ CLI end to end against the fake API
  smoke/       optional live API check
```

## Development

```bash
npm run dev -- "Seedcamp"   # run from source (Node 22.18+ strips TypeScript types natively)
npm test                    # unit and integration tests, no API key needed
npm run test:smoke          # live API check, skipped without credentials, costs about a dozen credits
npm run typecheck
npm run build
```

Unit tests sit next to the file they cover (`leadership.ts` → `leadership.test.ts`). Fixtures are fictional; never commit real Dealroom responses.
