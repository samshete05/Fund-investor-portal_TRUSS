CREATE TABLE IF NOT EXISTS companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legal_name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  offering_type TEXT NOT NULL,
  authority_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'needs_changes', 'approved', 'rejected', 'suspended')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_memberships (
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('representative', 'reviewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, clerk_user_id)
);

CREATE TABLE IF NOT EXISTS company_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offerings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  proposed_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  eligibility_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_disclosures TEXT NOT NULL,
  use_of_proceeds TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'needs_changes', 'approved', 'published', 'paused', 'rejected', 'closed')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offering_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id BIGINT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  terms JSONB NOT NULL,
  eligibility_criteria JSONB NOT NULL,
  author_clerk_user_id TEXT NOT NULL,
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (offering_id, version_number)
);

CREATE TABLE IF NOT EXISTS offering_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id BIGINT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  document_type TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expressions_of_interest (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id BIGINT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  investor_clerk_user_id TEXT NOT NULL,
  intended_amount NUMERIC(24, 2) NOT NULL CHECK (intended_amount > 0),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  decision_note TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS companies_status_idx ON companies (status, created_at DESC);
CREATE INDEX IF NOT EXISTS offerings_status_idx ON offerings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS expressions_investor_idx ON expressions_of_interest (investor_clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expressions_offering_idx ON expressions_of_interest (offering_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_clerk_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_audit_entity_idx
  ON marketplace_audit_events (entity_type, entity_id, created_at DESC);
