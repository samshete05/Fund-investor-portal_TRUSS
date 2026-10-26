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

  -- all about the admin review process to store in db
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
