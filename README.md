# Sheeply

[![npm](https://img.shields.io/npm/v/sheeply?logo=npm&label=npm)](https://www.npmjs.com/package/sheeply)
[![Node](https://img.shields.io/node/v/sheeply)](https://nodejs.org)
[![Licence: MIT](https://img.shields.io/npm/l/sheeply)](LICENSE)

Is your VC a black sheep or one of the flock?

```bash
npx sheeply "Seedcamp"
```

Every investor says they back founders early and lead with conviction. Sheeply checks. Give it a firm's name and it pulls the firm's portfolio and every funding round from [Dealroom](https://dealroom.co), works out how often the firm leads or goes in first rather than following someone else, and draws you a sheep.

```text
$ sheeply "Example Ventures"
Investor: Example Ventures
          .-~~-.-~~-.-~~-.
  ,--.  .( @ @ @@ @ @ @@ ).
 ( o  \(@@ @ @@ @ @ @@ @ @ )
  \   /(@ @ @ @@ @ @ @@ @ @)
   `-'  `(@ @@ @ @ @@ @ @)'
          `-~~-'-~~-'-~~-'
            ||        ||
            ^^        ^^
42% black sheep: Grey area. Shear indecision.
```

The fuller the fleece, the more the firm follows the flock. An empty outline is a true black sheep.

Built as dry run #1 for [40 for 40](https://build40for40.com). It runs on your machine: no server, no accounts, no AI guessing.

## What the score means

The black sheep score runs from 0 to 100 and asks two questions about each firm's first investment in a company since 2020:

1. **Did it lead?** Was it the round's lead investor, or the only investor, rather than joining a round someone else led?
2. **Did it go in first?** Was this the company's first VC round, rather than joining a company that had already raised behind someone else's lead?

Each answer becomes a rank against a peer set of 31 UK and European early-stage investors, and the score is the average of the two ranks. So 50 means "about as independent as a typical early-stage peer", and 100 means "more independent than every one of them".

| Score | Label |
| --- | --- |
| 0 to 15 | Pure white sheep. Baaa-sically the whole flock. |
| 16 to 35 | Follows the flock |
| 36 to 55 | Grey area. Shear indecision. |
| 56 to 75 | Ewe-nique taste |
| 76 to 90 | Ram-pant contrarian |
| 91 to 100 | True Blaaaaack Sheep |

**Take it with a pinch of salt.** It only sees announced rounds in Dealroom. It can't see who committed first, how fast a firm moved or whether it asked "who's leading?" before saying yes. Dealroom also leaves gaps: some rounds name no lead at all, and some list only one investor because nobody recorded the others. The JSON report gives a range for every score (firms whose ranges overlap shouldn't be called different), plus the counts behind it. A firm with too little recent data, or one that mostly invests after seed, gets an explanation instead of a score.

## Getting started

You need Node.js 22.13 or later and a Dealroom API key (see below). Then run it straight from npm, nothing to install:

```bash
npx sheeply "Seedcamp"
```

Or install it once and drop the `npx`:

```bash
npm install -g sheeply
sheeply "Seedcamp"
```

### Your Dealroom key

A Dealroom API key is a client id and a secret, created under API settings in Dealroom. Put both in a `.env` file in the folder you run Sheeply from, or export them in your shell:

```bash
DEALROOM_CLIENT_ID=your-client-id
DEALROOM_CLIENT_SECRET=your-client-secret
```

Keys issued during Dealroom's open beta also need `DEALROOM_API_BASE_URL=https://api.beta.dealroom.app`.

**It costs credits.** Dealroom charges about one credit per record. A firm with about 500 portfolio companies costs roughly 2,300 credits the first time. After that the data is cached, and rerunning is free.

## Using it

```bash
sheeply "Seedcamp"                  # draw the sheep (fetches the firm the first time)
sheeply "Seedcamp" --format json    # the full report, with every number behind the score
sheeply "Seedcamp" --offline        # use only what's cached, never call Dealroom
sheeply "Seedcamp" --refresh        # fetch fresh data from Dealroom
```

**If a name matches more than one firm,** Sheeply asks which one you mean. In a script, or with `--no-interactive`, it stops and lists the candidates with their ids instead. Pass one back with `--investor-id <id>`.

All the options:

| Option | What it does |
| --- | --- |
| `--format sheep` or `json` | The sheep (default), or the full JSON report |
| `--verbose` | Adds every company and round behind the numbers to the JSON |
| `--output <file>` | Writes the output to a file instead of the screen |
| `--investor-id <id>` | Skips name matching and uses an exact Dealroom id |
| `--offline` | Uses only cached data, never calls Dealroom |
| `--refresh` | Fetches the firm again even if it's cached |
| `--db <file>` | Uses a different cache file (default `./sheeply.sqlite`) |
| `--no-interactive` | Fails with the candidates instead of asking which firm you meant |

Two housekeeping commands: `sheeply db status` lists what's cached, and `sheeply db rebuild` rebuilds the cache's tables from the stored Dealroom responses without calling the API.

Messages go to stderr and the result to stdout, so piping works: `sheeply "Seedcamp" --format json | jq .black_sheep_score`. Exit code `2` means a usage problem, an ambiguous name or not enough data; `3` means Dealroom returned an error.

## The full report

`--format json` gives you everything the score is built from, and more:

- **Black sheep score:** the score, its range, both ranks and the raw counts behind them.
- **Entry maturity:** the stage of each first investment (pre-seed, seed, Series A, Series B+ or unknown), plus company age and how much the company had raised before.
- **Investment leadership:** how often the firm is recorded as lead, and how complete Dealroom's lead data is for that firm.
- **Sector exposure:** which industries the firm's companies are in.
- **Syndicate relationships:** who led the rounds the firm joined, and who it keeps investing alongside.
- **Data quality:** what was missing, what was left out and why.
- **Interpretation:** plain-English statements, each with the rule and threshold behind it.

Every percentage comes with its count and denominator. The same cached data always gives exactly the same report, so results can be checked and compared.

How each number is calculated is in [docs/methodology.md](docs/methodology.md). Which Dealroom field feeds what is in [docs/dealroom-field-mapping.md](docs/dealroom-field-mapping.md), and known gaps in Dealroom's API are in [docs/api-limitations.md](docs/api-limitations.md).

## Your data stays yours

Everything Sheeply fetches lives in a SQLite file on your machine. Dealroom's data is licensed, so none of it is committed to this repo or shipped in the package. The only Dealroom-derived numbers in the package are the anonymised peer figures the score ranks against: two sorted lists of shares with no names attached.

## How it works

```text
Dealroom API ──► raw responses, stored verbatim ──► tables ──► analysis ──► sheep or JSON
                 (sheeply.sqlite)                   rebuilt     pure functions,
                                                    any time    no network
```

The cached file is a convenience, not the source of truth: delete it and Sheeply fetches everything again. The peer figures come from an internal script, `npm run calibrate`, which fetches the peer list in `scripts/peers.ts` and regenerates `src/analysis/black-sheep-calibration.ts`. Users never need to run it.

```text
src/
  cli/        the commands
  dealroom/   API client: login, retries, rate limits, schema checks, paging
  db/         the SQLite cache
  ingest/     finding the firm, fetching it and turning responses into tables
  analysis/   the metrics, the black sheep score and its peer figures
  reports/    the JSON report and the sheep
scripts/      peer list and calibration (internal)
tests/        fictional Dealroom data, an in-memory fake API, CLI tests and an optional live check
```

## Development

```bash
git clone https://github.com/build40for40/sheeply.git
cd sheeply
npm install
npm run dev -- "Seedcamp"   # run from source
npm test                    # all tests, no Dealroom key needed
npm run typecheck
npm run test:smoke          # a quick live check, about a dozen credits, skipped without a key
```

Unit tests sit next to the file they cover (`leadership.ts` and `leadership.test.ts`). Test data is made up: never commit real Dealroom responses. All settings, including rate limits and timeouts, are read from environment variables in `src/config.ts`.

## Licence

MIT
