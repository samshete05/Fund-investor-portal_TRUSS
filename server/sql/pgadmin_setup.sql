CREATE TABLE IF NOT EXISTS investor_applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country_of_residence TEXT,
  postal_code TEXT NOT NULL,
  referral_source TEXT,
  linkedin_url TEXT,
  investor_type TEXT NOT NULL,
  investment_vehicle TEXT NOT NULL,
  accredited_status TEXT NOT NULL,
  qualified_purchaser_status TEXT NOT NULL,
  investment_horizon TEXT NOT NULL,
  risk_comfort TEXT NOT NULL,
  investment_experience TEXT NOT NULL,
  liquid_worth_range TEXT NOT NULL,
  privacy_notice_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_notice_accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by_clerk_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investor_applications_status_created_idx
  ON investor_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS investor_application_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES investor_applications(id) ON DELETE CASCADE,
  reviewer_clerk_user_id TEXT NOT NULL,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('pending', 'approved', 'rejected')),
  new_status TEXT NOT NULL CHECK (new_status IN ('approved', 'rejected')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investor_application_reviews_application_idx
  ON investor_application_reviews (application_id, created_at DESC);

CREATE SCHEMA IF NOT EXISTS portal;

CREATE OR REPLACE FUNCTION portal.submit_investor_application(p JSONB)
RETURNS TABLE(id BIGINT, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  INSERT INTO investor_applications (
    clerk_user_id, first_name, last_name, email, phone, country_of_residence, postal_code,
    referral_source, linkedin_url, investor_type, investment_vehicle, accredited_status,
    qualified_purchaser_status, investment_horizon, risk_comfort, investment_experience,
    liquid_worth_range, privacy_notice_accepted, privacy_notice_accepted_at
  ) VALUES (
    p->>'clerkUserId', p->>'firstName', p->>'lastName', p->>'email', p->>'phone',
    p->>'countryOfResidence', p->>'postalCode', p->>'referralSource', p->>'linkedInUrl',
    p->>'investorType', p->>'investmentVehicle', p->>'accreditedStatus',
    p->>'qualifiedPurchaserStatus', p->>'investmentHorizon', p->>'riskComfort',
    p->>'investmentExperience', p->>'liquidWorthRange', (p->>'privacyAccepted')::BOOLEAN, NOW()
  )
  ON CONFLICT (clerk_user_id) DO UPDATE SET
    first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, email=EXCLUDED.email,
    phone=EXCLUDED.phone, country_of_residence=EXCLUDED.country_of_residence,
    postal_code=EXCLUDED.postal_code, referral_source=EXCLUDED.referral_source,
    linkedin_url=EXCLUDED.linkedin_url, investor_type=EXCLUDED.investor_type,
    investment_vehicle=EXCLUDED.investment_vehicle, accredited_status=EXCLUDED.accredited_status,
    qualified_purchaser_status=EXCLUDED.qualified_purchaser_status,
    investment_horizon=EXCLUDED.investment_horizon, risk_comfort=EXCLUDED.risk_comfort,
    investment_experience=EXCLUDED.investment_experience, liquid_worth_range=EXCLUDED.liquid_worth_range,
    privacy_notice_accepted=EXCLUDED.privacy_notice_accepted, privacy_notice_accepted_at=NOW(),
    status='pending', admin_note=NULL, reviewed_by_clerk_user_id=NULL, reviewed_at=NULL, updated_at=NOW()
  WHERE investor_applications.status='rejected'
  RETURNING investor_applications.id, investor_applications.status, investor_applications.created_at;

  IF NOT FOUND THEN
    RETURN QUERY SELECT a.id, a.status, a.created_at
    FROM investor_applications a WHERE a.clerk_user_id=p->>'clerkUserId';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION portal.get_investor_application(p_clerk_user_id TEXT)
RETURNS TABLE(id BIGINT, status TEXT, admin_note TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.status, a.admin_note, a.reviewed_at, a.created_at, a.updated_at
  FROM investor_applications a WHERE a.clerk_user_id=p_clerk_user_id
$$;

CREATE OR REPLACE FUNCTION portal.list_admin_applications()
RETURNS SETOF investor_applications
LANGUAGE sql STABLE AS $$
  SELECT a.* FROM investor_applications a
  ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC
$$;

CREATE OR REPLACE FUNCTION portal.review_investor_application(p_id BIGINT, p_status TEXT, p_note TEXT, p_reviewer TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  previous_status TEXT;
BEGIN
  SELECT a.status INTO previous_status FROM investor_applications a WHERE a.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF previous_status <> 'pending' THEN RETURN jsonb_build_object('outcome', 'not_pending'); END IF;

  UPDATE investor_applications SET status=p_status, admin_note=p_note,
    reviewed_by_clerk_user_id=p_reviewer, reviewed_at=NOW(), updated_at=NOW()
  WHERE id=p_id;
  INSERT INTO investor_application_reviews (application_id, reviewer_clerk_user_id, previous_status, new_status, note)
  VALUES (p_id, p_reviewer, previous_status, p_status, p_note);
  RETURN jsonb_build_object('outcome', 'reviewed', 'application',
    jsonb_build_object('id', p_id, 'status', p_status, 'adminNote', p_note));
END;
$$;

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
