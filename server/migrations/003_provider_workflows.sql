CREATE TABLE IF NOT EXISTS investor_provider_workflows (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE REFERENCES investor_applications(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  kyc_provider TEXT NOT NULL,
  kyc_case_id TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (kyc_status IN ('not_started', 'pending', 'needs_information', 'approved', 'rejected')),
  kyc_next_action TEXT,
  kyc_environment TEXT NOT NULL CHECK (kyc_environment IN ('sandbox', 'production')),
  kyc_started_at TIMESTAMPTZ,
  kyc_updated_at TIMESTAMPTZ,
  kyc_decided_at TIMESTAMPTZ,
  kyc_provider_updated_at TIMESTAMPTZ,
  esign_provider TEXT NOT NULL,
  esign_envelope_id TEXT,
  esign_status TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (esign_status IN ('not_sent', 'sent', 'viewed', 'signed', 'declined')),
  agreement_version TEXT,
  esign_next_action TEXT,
  esign_environment TEXT NOT NULL CHECK (esign_environment IN ('sandbox', 'production')),
  esign_sent_at TIMESTAMPTZ,
  esign_viewed_at TIMESTAMPTZ,
  esign_signed_at TIMESTAMPTZ,
  esign_declined_at TIMESTAMPTZ,
  esign_provider_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kyc_provider, kyc_case_id),
  UNIQUE (esign_provider, esign_envelope_id)
);

CREATE INDEX IF NOT EXISTS investor_provider_workflows_kyc_status_idx
  ON investor_provider_workflows (kyc_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS investor_provider_workflows_esign_status_idx
  ON investor_provider_workflows (esign_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS provider_webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_object_id TEXT NOT NULL,
  provider_created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS investor_workflow_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES investor_applications(id) ON DELETE CASCADE,
  provider TEXT,
  provider_event_id TEXT,
  actor_clerk_user_id TEXT,
  event_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  next_action TEXT,
  agreement_version TEXT,
  admin_note TEXT,
  environment TEXT CHECK (environment IN ('sandbox', 'production')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investor_workflow_audit_application_idx
  ON investor_workflow_audit (application_id, created_at DESC);
