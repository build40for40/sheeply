# Methodology

Algorithm version `0.3.0`. Every number in the report can be traced to the rounds listed under `contributions` with `--verbose`, and every threshold is printed in the report itself.

## The model

Three outputs, computed independently from one investment history:

| Output | Role | Question |
| --- | --- | --- |
| `entry_maturity` | Metric | How early does this investor enter companies? |
| `investment_leadership` | Metric | How often does it lead its initial investments? |
| `sector_exposure` | Descriptive | Which sectors does it enter? |

Plus `syndicate_relationships`, descriptive context for leadership (who led the rounds it joined, who it co-invests with), and `black_sheep_score`, the one composite: a rank against a built-in peer calibration, described [below](#black-sheep-score).

Within the profile, correlated signals are not counted twice:

- Company age at entry, prior capital and entry position measure the same maturity as stage, so they sit inside `entry_maturity.explanatory_attributes` and are never scored.
- Lead-partner concentration describes the same behaviour as the non-lead rate, so it is context, not a second leadership measure.
- Sector exposure is context and does not feed any rule.

Each section carries `role: "metric"`, `"descriptive"` or `"score"`, and every rate is a `{ numerator, denominator, value }` triple. The black sheep score reads the same investment history; it does not change how the metrics are computed.

## Principles

- **Observations, metrics and interpretation are separate.** Raw counts sit next to every share; the interpretation only restates them against fixed thresholds.
- **Unknown is never zero.** Each share names its denominator. Anything not classified is counted in `data_quality.exclusions` with a reason.
- **No look-ahead.** A first investment is described only by facts dated at or before it. A company's current valuation, status, total funding or later rounds never describe the entry.
- **Firm level only.** Dealroom's "investor" is the firm. Fund vehicles carry no link to rounds, so nothing is attributed to a fund.
- **Benchmarks are explicit.** The metrics compare an investor only with a stated 50% line, so they say "most" or "a minority", never "high" or "low". Only the black sheep score compares investors, and it names its peer set and version.

## The investment history

For investor _I_:

1. **Portfolio**: every row from `/investors/{I}/portfolio`.
2. **Company rounds**: every round of every portfolio company (`company_investor_id` filter), including rounds _I_ did not join.
3. **Participations**: company rounds whose `investors[]` contains _I_'s UUID exactly.
4. **Order**: by announced date as a span (`2019` covers the whole year, `2019-06` the month), then the earlier stage, then the lower Dealroom id. Undated rounds sort last.
5. **First observed investment**: _I_'s earliest participation in the company. Later participations are follow-ons.

This is the earliest round **in which _I_ was observed**, which is not necessarily the earliest round **raised by the company**. Both are kept: `entry_context.company_first_known_vc_round_id` in verbose output, and `entry_position` below.

Portfolio statuses:

| Status | Meaning |
| --- | --- |
| `initial_identified` | _I_ appears on at least one of the company's rounds |
| `no_round_attribution` | Portfolio says `rounds_count: 0`: Dealroom knows a stake but not the round |
| `rounds_not_matched` | Portfolio says _I_ joined rounds, but no returned round lists _I_ |
| `participation_undisclosed` | As above, and some company rounds have `investors: null`, so _I_ may be hidden there |
| `not_a_company` | University, gov/NGO or investor |

Only `initial_identified` companies feed the outputs. Flags warn where the first investment may be wrong:

- `initial_ordering_ambiguous`: the next participation's date span overlaps the first one's.
- `undated_participation`: another participation has no date and could be earlier.
- `initial_undated`: the first round itself has no date.
- `earlier_round_investors_undisclosed`: a company round that may be earlier has no investor list. A missing list is not an empty list, so _I_ may have entered there.

## Metric A: Entry maturity

**Primary result**: the stage distribution of first investments across Pre-seed, Seed, Series A, Series B+ and Unknown. `share` uses all first investments as the denominator (so Unknown is visible); `share_of_known_stage` excludes Unknown.

**Stage source: `round_label`**, Dealroom's own stage classification. Dealroom's filter reference describes `round_label` as "Rounds by Dealroom's standardized round stage" and notes that "rounds that don't meet a stage definition have no label". The similarly named `standardized_round` is not used, because in live data it is two different things:

- where `round_label` exists, `standardized_round` is a coarser copy of it (952 of 952 Seedcamp-portfolio rounds agreed);
- where `round_label` is null, `standardized_round` is the self-reported `round_type` mapped across (`SEED` → Seed, `SUPPORT PROGRAM` → Other), as Dealroom's filter docs say: it "falls back to the reported round type when Dealroom left a round unlabelled".

So a round without a label is **Unknown**. `unknown_breakdown` shows what `standardized_round` says about those rounds, and `first_investments_by_standardized_round` is printed as a sensitivity check. Sheeply never infers a stage from round amounts.

| Bucket | `round_label` |
| --- | --- |
| Pre-seed | Pre-Seed |
| Seed | Micro-Seed, Seed, Seed+, Seed Extension |
| Series A | Series A, Series A Extension |
| Series B+ | Series B to Series F, and their extensions |
| Unknown | null, or any label outside this ladder |

**Explanatory attributes** (descriptive, not scored):

- `entry_position.prior_vc_rounds`: how many of the company's VC rounds (`is_vc_round: true`) are dated definitely before _I_'s first round: 0, 1, 2, 3+, or uncertain when partial or missing dates prevent ordering. `entered_at_company_first_known_vc_round` is the rate at which _I_'s first round **is** the company's earliest known VC round; uncertain cases are left out of its denominator.
- `company_age_at_entry_years`: entry year minus the company's `launch_date` year (year precision). Entries dated before the recorded launch are counted, not summarised.
- `prior_vc_capital`: sum of disclosed amounts of those prior VC rounds. Only companies with no undisclosed amount and no uncertain ordering are summarised; the rest are counted as incomplete.

These use only rounds dated before the entry, so they are free of look-ahead. All three understate maturity when a company's early history is missing: `data_quality.funding_histories.history_starts_at_series_a_or_later` counts companies whose earliest known VC round is already Series A or later.

## Metric B: Investment leadership

```text
lead_rate = first investments recorded as lead or co-lead
            ─────────────────────────────────────────────
            first investments with a usable lead status
```

_I_'s lead status on each first-investment round, from that round's own participant flags:

| Status | Rule | Usable |
| --- | --- | --- |
| `sole_lead` | _I_ `is_lead: true`, nobody else is | Yes, as lead |
| `co_lead` | _I_ `is_lead: true`, someone else is too | Yes, as lead |
| `recorded_non_lead` | _I_ `is_lead: false`, someone else `is_lead: true` | Yes, as non-lead |
| `false_with_no_lead_on_round` | _I_ `is_lead: false`, nobody flagged as lead | No |
| `null_lead_flag` | _I_ `is_lead: null` | No |

`lead_status_completeness` is usable over all first investments. The same breakdown over every participation (first investments plus follow-ons) is the secondary statistic `all_participations`.

**Why `false` is only usable when another lead is flagged.** The spec documents `is_lead` as nullable ("Whether this investor led the round, when known"), so `false` should mean a confirmed non-lead. The live data says otherwise:

- Not one of 4,652 participant flags in Seedcamp's portfolio rounds is `null`; every flag is `true` or `false`.
- Only 37% of rounds with participants (556 of 1,521) flag anyone as lead.
- 591 rounds list a **single** investor flagged `false`. A round's only disclosed investor cannot be a confirmed follower of nobody.
- Lead coverage climbs with time (14% of rounds before 2015, 53% from 2023) and with syndicate size (15% of single-investor rounds, 64% of rounds with four or more), which fits "not recorded" far better than "not led".

So on a round with no flagged lead, `false` cannot separate "did not lead" from "lead not recorded", and a round without an identified lead does not show that everyone followed. Those first investments are excluded from the denominator and reported. `sensitivity.lead_rate_if_every_false_is_non_lead` gives the other bound (Seedcamp: 39% usable, 14% if every false counted). `data_quality.lead_flags` repeats this evidence for every investor analysed.

**What the lead flag does not show.** It records Dealroom's view of who led the announced round. It does not show who originated the deal, who committed first or who set terms. Announcement dates are never used to infer any of that; they are only used to order _I_'s own rounds.

## Output C: Sector exposure (descriptive)

Dealroom has described 18 broad, mutually exclusive sectors, but the API does not expose such a classification. Checked on 2026-10-28: the OpenAPI spec, the docs index and `/reference/filters?scope=companies` list taxonomy families `industry`, `sub_industry`, `technology`, `sector`, `sdg`, `business_model`, `income_stream`, `client_focus`, `ownership` and `techstack_category`, none mutually exclusive. The highest level is `industry` ("Highest-level industry classification", 31 values), and 182 of 513 Seedcamp portfolio companies carry two.

So Sheeply reports **multi-label industry exposure**:

- Denominator: first-investment companies with at least one industry label (`labelled`).
- A company with two industries counts once in each, so shares sum past 100%. `label_assignments` shows by how much.
- `breadth.effective_number_of_industries`: each company splits a weight of 1 across its industries, then `1 / Σ share²`.
- `sector`, `technology` and `techstack_category` tags are ignored (Dealroom's own guidance: same-named sector tags are niche, techstack describes a website).
- This is the company's **current** classification, the one deliberate exception to no-look-ahead, acceptable only because it is context.

If Dealroom exposes the exclusive classification later, it becomes a single-label distribution of first investments with the same shape.

## Syndicate relationships (descriptive)

- **Lead partners**: on first investments with status `recorded_non_lead`, the other participants flagged as lead. Counts, top-lead share, distinct partners and a Herfindahl index (a multi-lead round's weight is split equally).
- **Co-investors**: every other participant on any participation with a disclosed investor list, once per round.

Context only: no interpretation rule reads it.

## Black sheep score

`black_sheep_score` answers: how often does this investor lead or go in first, rather than follow others, compared with early-stage peers? 0 follows the flock the most among the peers, 100 is the most contrarian. The default `sheep` output draws it; `--format json` gives the counts behind it.

**Observations.** Every first investment announced in 2020 or later. Recent years only, because lead flags are far more complete since 2020 and peers of different ages are then compared over the same market.

- **Led**: _I_ is flagged lead or co-lead, **or is the only disclosed investor on the round**. A sole investor is treated as the leader whatever its flag says.
- **Followed**: _I_ is flagged `false` and another participant is flagged lead.
- Anything else has no usable lead status and is left out of the lead counts.
- **Late**: the company had a VC round dated definitely before _I_'s first round (`entry_context.prior_vc_rounds > 0`). Uncertain ordering is left out.

**Two components**, each a percentile among peers, inverted so higher is more contrarian:

| Component | Share ranked among peers |
| --- | --- |
| `leads` | first investments that followed another lead, over those with a usable lead status |
| `independent_entry` | late share × followed share among late entries: how often _I_ joins an already funded company behind someone else's lead |

A percentile counts peers below, plus half of exact ties, over all peers. `value` is the equal-weight average of the two. There is no evidence for other weights, and both components are printed.

**Peers and calibration.** The comparison is internal and built in: users never fetch peers. `scripts/peers.ts` lists the peer set by Dealroom id, with a dated version: UK and European early-stage investors, plus investors whose structure fixes their behaviour (angel networks, high-volume small-cheque funds and accelerators) as a check that the score separates them. `npm run calibrate` fetches any peer missing from the local cache, computes each peer's two shares and writes them to `src/analysis/black-sheep-calibration.ts` as two sorted lists of numbers, with no names or ids. A peer counts towards a component only when at least half of its known-stage first investments are pre-seed or seed and it has at least 10 observations for that component. When the investor being scored is itself a peer, one share equal to its own is dropped, so it is not ranked against itself. Any change to how the shares are computed needs a new calibration, and the calibration records the algorithm version it came from.

**Not scored** when any of these hold, with `reasons` saying which:

- fewer than half of its known-stage first investments are pre-seed or seed, so early-stage peers are the wrong comparison;
- fewer than 10 first investments with a usable lead status, or fewer than 10 late ones.

**Range.** `range` is a 90% interval from 1,000 resamples of the investor's own first investments, with a fixed seed so it is reproducible. It reflects sampling noise only, not gaps in Dealroom's records. Two investors whose ranges overlap should not be called different.

**What it can get wrong:**

- Dealroom often lists one investor when it has not recorded the others, so the sole-investor rule can credit funds whose co-investors are missing. Funds writing many small cheques are most exposed. `components.leads.sole_investor` shows how many observations rest on it.
- With the sole-investor rule the two components move closely together across the first peer set (rank correlation about 0.9), so the score is mostly about leading. Without the rule they were nearly unrelated.
- It describes announced rounds. It cannot see who committed first, how fast a fund moved or whether it asked "who's leading?" before saying yes, which is much of what founders experience.

Only the calibration's numbers ship in the package, never peer records. `calibration.fingerprint` hashes the calibration used, so two reports can be checked for the same comparison.

## Interpretation rules

Thresholds live in `src/analysis/interpretation.ts` and are copied into every report.

| Rule | Fires when |
| --- | --- |
| `*.insufficient_sample` | Fewer than 10 in the metric's denominator; the metric is not described |
| `entry_maturity.majority_pre_seed_or_seed` / `majority_series_a_or_later` | Pre-seed + seed ≥ / < 50% of first investments with a known stage; the statement also gives the Unknown count |
| `entry_maturity.entry_position` | Always with a described entry metric: how often the first observed round was the company's first known VC round |
| `investment_leadership.led_majority` / `led_minority` | Lead rate ≥ / < 50% |
| `investment_leadership.caveat` | With `led_minority`: a minority rate alone does not establish follower behaviour |
| `investment_leadership.sensitivity` | Some first investments have `false` with no lead on the round |
| `data_quality.*_coverage` | Entry-stage or lead-status coverage below 70% |
| `data_quality.portfolio_incomplete` | Fewer portfolio rows returned than Dealroom reports |

## Reproducibility

- The report has no wall-clock timestamp. Given the same stored data and algorithm version it is byte-identical, online or offline.
- `source.dataset_fingerprint` is a SHA-256 of exactly the records the analysis read.
- `tool.algorithm_version` changes with any metric or threshold; `tool.extraction_version` with any change to how responses become tables; `report_schema_version` with the JSON shape.
- SQLite is a cache. `sheeply db rebuild` re-derives every table from stored Dealroom responses; a fresh database re-derives everything from the API.

## Not in this version

- A stage-weighted early-entry score or stage-adjusted benchmarks. Peer sets for later-stage investors, so the black sheep score can rank them too.
- Merging entities that belong to one firm (for example a separately listed fund vehicle).
