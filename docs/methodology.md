# Methodology

Algorithm version `0.1.0`. This is a first, deliberately simple version. Every number in the report can be traced to the rounds listed under `contributions` with `--verbose`, and every threshold is printed in the report itself.

## Principles

- **Observations, metrics and interpretation are separate.** The report keeps raw counts (`count`, `rounds`, `known`) next to every share, and the interpretation section only restates those numbers against fixed thresholds.
- **Unknown is never zero.** Every share has an explicit denominator. Records that cannot be classified are counted under `data_quality.exclusions` with the reason.
- **No look-ahead.** A first investment is described only by facts about that round: its date, Dealroom's stage label for it and the participants on it. A company's current valuation, later rounds, current status or total funding are never used to describe the entry.
- **Firm level only.** Dealroom's "investor" is the firm. Fund vehicles (`/investors/{id}/funds`) carry no link to rounds or companies, so nothing is attributed to a fund.
- **No market benchmark.** Without a peer set, Sheeply never calls a rate "high" or "low". It says "most" or "a minority" against a stated 50% line.

## The investment history

For investor _I_:

1. **Portfolio**: every row from `/investors/{I}/portfolio`.
2. **Rounds**: every round of every portfolio company (`company_investor_id` filter), including rounds _I_ did not join.
3. **Participations**: the company rounds whose `investors[]` contains _I_'s UUID exactly. Other entities with similar names are not merged.
4. **Order**: participations sort by announced date. A partial date is a span (`2019` covers the whole year, `2019-06` the whole month). Ties break on the earlier stage, then the lower Dealroom id. Undated rounds sort last.
5. **First observed investment**: the earliest participation. Every later participation in the same company is a **follow-on**.

Each portfolio company gets one status:

| Status | Meaning |
| --- | --- |
| `initial_identified` | _I_ appears on at least one of the company's rounds |
| `no_round_attribution` | Portfolio says `rounds_count: 0`: Dealroom knows of a stake but not the round |
| `rounds_not_matched` | Portfolio says _I_ joined rounds, but none of the returned rounds lists _I_ |
| `not_a_company` | The portfolio row is a university, gov/NGO or investor |

Only `initial_identified` companies feed the metrics. Flags warn where the first investment may be wrong:

- `initial_ordering_ambiguous`: the next participation's date span overlaps the first one's, so the order is a tie-break, not a fact.
- `undated_participation`: another participation has no date and could be earlier.
- `initial_undated`: the chosen first round has no date at all.

"First observed" matters: if Dealroom is missing an earlier round, the entry stage is later than the truth. `data_quality.rounds.companies_without_any_round` and the status counts show how much of the portfolio has no usable history.

## 1. Entry maturity

The stage of each first investment, from Dealroom's `round_label`:

| Bucket | `round_label` values |
| --- | --- |
| Pre-seed | Pre-Seed |
| Seed | Micro-Seed, Seed, Seed+, Seed Extension |
| Series A | Series A, Series A Extension |
| Series B+ | Series B to Series F, and their extensions |

Shares use the first investments with a mapped label as the denominator.

`round_label` is Dealroom's own stage definition (based on deal size, company age and funding history). When a round meets no definition the label is null. We count it as unknown stage and report its `standardized_round` in `unknown_stage_breakdown`. We do **not** fall back to `standardized_round`, because Dealroom documents that it "falls back to the reported round type when Dealroom left a round unlabelled", and the reported type is largely marketing. `initial_rounds_by_standardized_round` is printed as a sensitivity check.

## 2. Leadership

For each first investment, _I_'s lead status on that round:

| Status | Rule |
| --- | --- |
| `sole_lead` | _I_ has `is_lead: true` and nobody else does |
| `co_lead` | _I_ has `is_lead: true` and at least one other participant does too |
| `not_led` | _I_ has `is_lead: false` and another participant has `is_lead: true` |
| `no_lead_recorded` | _I_ has `is_lead: false` and **no** participant has `is_lead: true` |
| `unknown` | _I_'s `is_lead` is `null` |

`led_share_of_known = (sole_lead + co_lead) / (sole_lead + co_lead + not_led)`.

Why `no_lead_recorded` is not a non-lead: live data shows Dealroom always sends `true` or `false`, never `null`, yet 1,221 of the 1,777 rounds in Seedcamp's portfolio have nobody flagged as lead. On those rounds `false` cannot tell "did not lead" from "lead not recorded". Counting them as non-leads would mostly measure missing data. The report prints `led_share_if_unflagged_means_not_led` as the other bound (Seedcamp: 39% vs 14%), and the interpretation says so whenever the two differ.

The same breakdown is repeated over all participations (first investments plus follow-ons).

## 3. Syndicate concentration

**Lead partners.** Population: first investments with status `not_led`, i.e. rounds _I_ joined while someone else led. For each, the leads are the other participants with `is_lead: true`.

- `rounds[partner]`: number of those rounds the partner led. A round with two leads counts once for each.
- `top_lead_dependence = rounds[top partner] / population`.
- `unique_lead_partners`: distinct leads.
- `herfindahl_index`: each round's weight is split equally between its leads, so partner shares sum to 1, then `Σ share²`. 1 means one partner led everything; values near 0 mean many partners.

Ties rank by rounds, then name, then id.

**Co-investors.** Every participant other than _I_ on any participation where investors were disclosed, counted once per round. `repeat_co_investors` counts partners seen on two or more rounds. Individuals (`type: person`) are included and labelled, not merged with firms.

## Sectors

Dealroom `industry` tags (at most two per company) on the companies with a first investment. A company with two industries counts in both, so shares can sum past 100%. Sector, technology and techstack tags are ignored: Dealroom's own guidance warns that same-named `sector` tags are niche and `techstack_category` describes a company's website, not its business. This is the company's **current** classification, the one exception to the no-look-ahead rule, and it is labelled as such.

## Interpretation rules

All thresholds live in `src/analysis/interpretation.ts` and are copied into every report under `interpretation.thresholds`.

| Rule | Fires when |
| --- | --- |
| `*.insufficient_sample` | Fewer than 10 records in the metric's denominator; the metric is not described |
| `entry_stage.majority_pre_seed_or_seed` | Pre-seed + seed ≥ 50% of first investments with a known stage |
| `entry_stage.majority_series_a_or_later` | Otherwise |
| `leadership.led_majority` / `led_minority` | Led or co-led share of known ≥ 50% / < 50% |
| `leadership.caveat` | Always with `led_minority`: a minority lead rate alone does not establish follower behaviour |
| `leadership.sensitivity` | Some first investments are `no_lead_recorded` |
| `syndicates.concentrated` | Top-lead dependence ≥ 25% |
| `syndicates.diversified` | Top-lead dependence ≤ 10% |
| `syndicates.moderate` | Between the two |
| `data_quality.*_coverage` | Entry-stage or lead-status coverage < 70% |
| `data_quality.portfolio_incomplete` | Fewer portfolio rows returned than Dealroom reports |

## Reproducibility

- The report has no wall-clock timestamp of its own. Given the same stored data and the same algorithm version it is byte-identical, offline or online.
- `source.dataset_fingerprint` is a SHA-256 of exactly the records the analysis read (investor, portfolio, companies, rounds, participants), in canonical order.
- `tool.algorithm_version` changes with any metric or threshold; `tool.extraction_version` with any change to how responses become tables.
- SQLite is a cache, not the source of truth. `sheeply db rebuild` drops every derived table and re-derives it from the stored Dealroom responses; a fresh database plus `--refresh` re-derives everything from the API.

## Known gaps in this version

- Rounds where a company's stake came through a fund vehicle with a different Dealroom entity are not merged into the firm.
- No company age at entry, round size at entry or time to follow-on yet.
- No peer benchmark, so no comparative language.
