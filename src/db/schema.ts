/**
 * Two layers. `ingestion_runs` and `raw_responses` record exactly what Dealroom returned and when.
 * Every other table is derived from them by src/ingest/extract.ts and can be dropped and rebuilt
 * at any time (`sheeply db rebuild`), so it is never the source of truth.
 */

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE ingestion_runs (
        id INTEGER PRIMARY KEY,
        investor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        api_base_url TEXT NOT NULL,
        api_version TEXT NOT NULL,
        rounds_strategy TEXT,
        tool_version TEXT NOT NULL,
        requests INTEGER,
        credits_used INTEGER,
        error TEXT
      );
      CREATE INDEX ingestion_runs_investor ON ingestion_runs (investor_id, status, id);

      CREATE TABLE raw_responses (
        id INTEGER PRIMARY KEY,
        run_id INTEGER NOT NULL REFERENCES ingestion_runs (id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('investor', 'portfolio', 'transactions', 'company_rounds')),
        subject_id TEXT NOT NULL,
        page_index INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        params_json TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        api_version TEXT,
        credits_used INTEGER,
        body_sha256 TEXT NOT NULL,
        body_json TEXT NOT NULL
      );
      CREATE INDEX raw_responses_run ON raw_responses (run_id, kind, subject_id, page_index);
    `,
  },
];

export const DERIVED_TABLES = [
  "round_participants",
  "investor_round_scope",
  "funding_rounds",
  "company_taxonomy",
  "taxonomy_terms",
  "portfolio_relationships",
  "companies",
  "investors",
  "entities",
  "extraction_state",
] as const;

export const DERIVED_SCHEMA = `
  CREATE TABLE IF NOT EXISTS entities (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT,
    dealroom_url TEXT,
    source_response_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS investors (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT,
    firm_types_json TEXT NOT NULL,
    launch_date TEXT,
    domain TEXT,
    hq_country TEXT,
    dealroom_url TEXT,
    reported_portfolio_total INTEGER,
    reported_rounds_count INTEGER,
    source_response_id INTEGER NOT NULL,
    retrieved_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS investors_name_key ON investors (name_key);

  CREATE TABLE IF NOT EXISTS companies (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtype TEXT,
    launch_date TEXT,
    dealroom_url TEXT,
    taxonomy_known INTEGER NOT NULL,
    source_response_id INTEGER NOT NULL,
    retrieved_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS taxonomy_terms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_taxonomy (
    company_id TEXT NOT NULL,
    term_id INTEGER NOT NULL,
    source_response_id INTEGER NOT NULL,
    PRIMARY KEY (company_id, term_id)
  );

  CREATE TABLE IF NOT EXISTS portfolio_relationships (
    investor_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    company_subtype TEXT,
    is_lead_any INTEGER NOT NULL,
    rounds_count INTEGER NOT NULL,
    last_round_date TEXT,
    source_response_id INTEGER NOT NULL,
    retrieved_at TEXT NOT NULL,
    PRIMARY KEY (investor_id, company_id)
  );

  CREATE TABLE IF NOT EXISTS funding_rounds (
    id INTEGER PRIMARY KEY,
    company_id TEXT NOT NULL,
    announced_date TEXT,
    round_type TEXT,
    standardized_round TEXT,
    round_label TEXT,
    amount REAL,
    valuation REAL,
    currency TEXT,
    is_vc_round INTEGER,
    is_exit INTEGER,
    investors_disclosed INTEGER NOT NULL,
    source_url TEXT,
    source_response_id INTEGER NOT NULL,
    retrieved_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS funding_rounds_company ON funding_rounds (company_id);

  CREATE TABLE IF NOT EXISTS round_participants (
    round_id INTEGER NOT NULL,
    entity_id TEXT NOT NULL,
    is_lead INTEGER,
    position INTEGER NOT NULL,
    PRIMARY KEY (round_id, entity_id)
  );
  CREATE INDEX IF NOT EXISTS round_participants_entity ON round_participants (entity_id);

  CREATE TABLE IF NOT EXISTS investor_round_scope (
    investor_id TEXT NOT NULL,
    round_id INTEGER NOT NULL,
    PRIMARY KEY (investor_id, round_id)
  );

  CREATE TABLE IF NOT EXISTS extraction_state (
    investor_id TEXT PRIMARY KEY,
    run_id INTEGER NOT NULL,
    extraction_version TEXT NOT NULL
  );
`;
