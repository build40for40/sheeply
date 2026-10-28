# Dealroom API limitations and open questions

Checked against the docs and live API on 2026-10-28, API version `2026-10-22`, with a beta-issued key.

## Limitations Sheeply works around

1. **`is_lead: false` does not mean a confirmed non-lead.** The spec documents `is_lead` as nullable ("Whether this investor led the round, when known"), but all 4,652 participant flags on Seedcamp's portfolio rounds came back `true` or `false`. Only 37% of rounds with participants flag anyone as lead; 591 rounds list a single investor flagged `false`; lead coverage rises from 14% of pre-2015 rounds to 53% from 2023. Sheeply treats `false` as a non-lead only when another participant is flagged as lead, and reports the other reading as a sensitivity. See [methodology](methodology.md#metric-b-investment-leadership).
2. **Many rounds have no stage label.** `round_label` was null on 825 of 1,777 rounds (46%), including 324 rounds standardised as Seed (279 of them with an amount). Those first investments are excluded from entry maturity and broken down by `standardized_round` instead.
3. **`standardized_round` is not strictly standardised.** Where `round_label` exists, `standardized_round` is a coarser copy of it (952 of 952 rounds agreed). Where it is missing, `standardized_round` is the self-reported `round_type` mapped across, as the filter docs say ("falls back to the reported round type when Dealroom left a round unlabelled"). Sheeply uses `round_label` and never fills a missing label.
4. **No exclusive sector classification.** The API exposes overlapping taxonomy families only. The top level, `industry` (31 values), allows two per company (182 of 513 Seedcamp companies have two). Sector exposure is therefore multi-label, with shares that can exceed 100%.
5. **Portfolio stakes without rounds.** 47 of Seedcamp's 523 portfolio companies have `rounds_count: 0` and no rounds at all. They are counted and excluded, not guessed.
6. **Partial dates.** Rounds carry `announced_date` at source precision (`YYYY` or `YYYY-MM`). Order inside an overlapping span is a tie-break and is flagged.
7. **Funds are not linked to deals.** `/investors/{id}/funds` lists vehicles (name, size, date) with no round or company link, so fund-level attribution is impossible. Analysis is firm-level.
8. **Credits.** Each returned record costs a credit (portfolio row, transaction row); investor detail costs 2; search and `/reference` are free. A full Seedcamp fetch cost 2,302 credits; Ada Ventures cost 278. `402 CREDITS_EXHAUSTED` stops the run without retrying, and the cost of each run is stored and reported.
9. **Rate limit.** 5 requests per second per key. Sheeply spaces requests at 4 per second and honours `Retry-After` on 429.
10. **Intermittent gateway errors.** `include_total=true` on `/portfolio` returned a Cloudflare 504 during testing, so Sheeply never asks the portfolio for a total and reads the count from the investor profile instead. 5xx and network errors are retried with backoff.
11. **Production vs beta host.** The docs name `https://api.dealroom.app` with audience `https://api.dealroom.app`. A key issued during the open beta is refused by that audience (403) and works only with `DEALROOM_API_BASE_URL=https://api.beta.dealroom.app`.
12. **Short version support.** During the open beta a pinned version is supported for 30 days after it is superseded. Sheeply pins `2026-10-22` and warns on stderr when Dealroom sends a `Sunset` header.
13. **Redaction.** Callers without the premium tier get `investors: null` on rounds. API keys report `premium`; Sheeply still stores `investors_disclosed` and counts redacted rounds under data quality.

## Open questions for Dealroom

1. Does `is_lead: false` mean "confirmed not lead" or "not recorded"? Is `null` ever returned? Is there a way to tell a round with no lead from a round whose lead is unknown?
2. Is `round_label` computed from information available at the time of the round, or recomputed with later data (for example, a company's later funding history)? If the latter, it is mild look-ahead for entry maturity.
3. Why do labelled-looking seed rounds with amounts have no `round_label`? Which definition do they miss?
4. Are rounds ever re-attributed between investor entities (for example, from a fund vehicle entity to the firm), and does `company_investor_id` follow those links?
5. Does the portfolio include every company where the firm appears on a round, or only ones curated onto the profile? (For Seedcamp the two agreed exactly: zero `rounds_not_matched`.)
6. One Seedcamp portfolio round is dated 2006, before Seedcamp's 2007 launch date. Are pre-founding rounds expected (for example, partners investing before the fund existed)?
7. Is the 18-sector exclusive classification available through the API, or planned?
8. What does the Dealroom licence allow for local caching of raw responses? Sheeply keeps them only in the user's local SQLite file and never ships them.

## Unverified in this build

- The per-company fallback (`/companies/{id}/funding-rounds`) is covered by mocked tests only; the live key never needed it.
- `--refresh` against the live API was not re-run, to save credits. Refresh idempotency is covered by mocked integration tests.
- Windows and Linux were not run. SQLite comes from Node's built-in `node:sqlite`, so there is no native module to compile on any platform.
