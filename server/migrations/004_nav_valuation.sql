-- Fund positions are assigned by operations after investment records are reconciled.
CREATE TABLE IF NOT EXISTS fund_positions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  units NUMERIC(24, 10) NOT NULL CHECK (units > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_user_id, fund_name)
);

CREATE TABLE IF NOT EXISTS fund_position_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_id BIGINT NOT NULL REFERENCES fund_positions(id),
  actor_clerk_user_id TEXT NOT NULL,
  previous_units NUMERIC(24, 10),
  new_units NUMERIC(24, 10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fund_position_audit_position_idx
  ON fund_position_audit (position_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fund_nav_valuations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fund_name TEXT NOT NULL,
  nav_per_unit NUMERIC(24, 10) NOT NULL CHECK (nav_per_unit > 0),
  valuation_as_of TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by TEXT NOT NULL,
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fund_nav_valuations_latest_idx
  ON fund_nav_valuations (fund_name, status, valuation_as_of DESC);

CREATE TABLE IF NOT EXISTS fund_nav_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  valuation_id BIGINT NOT NULL REFERENCES fund_nav_valuations(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'approved', 'rejected')),
  actor_clerk_user_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fund_nav_audit_valuation_idx
  ON fund_nav_audit (valuation_id, created_at DESC);
