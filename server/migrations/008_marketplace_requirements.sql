ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS representative_name TEXT,
  ADD COLUMN IF NOT EXISTS representative_email TEXT,
  ADD COLUMN IF NOT EXISTS representative_phone TEXT,
  ADD COLUMN IF NOT EXISTS supporting_documents JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS instrument_type TEXT,
  ADD COLUMN IF NOT EXISTS target_amount NUMERIC(24, 2),
  ADD COLUMN IF NOT EXISTS minimum_interest_amount NUMERIC(24, 2),
  ADD COLUMN IF NOT EXISTS maximum_interest_amount NUMERIC(24, 2),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(24, 10),
  ADD COLUMN IF NOT EXISTS opening_date DATE,
  ADD COLUMN IF NOT EXISTS closing_date DATE,
  ADD COLUMN IF NOT EXISTS document_references JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE investor_applications
  ADD COLUMN IF NOT EXISTS institution_name TEXT,
  ADD COLUMN IF NOT EXISTS representative_title TEXT,
  ADD COLUMN IF NOT EXISTS representative_phone TEXT;

ALTER TABLE expressions_of_interest
  DROP CONSTRAINT IF EXISTS expressions_of_interest_status_check;

ALTER TABLE expressions_of_interest
  ADD CONSTRAINT expressions_of_interest_status_check
  CHECK (status IN ('submitted', 'under_review', 'needs_information', 'accepted', 'rejected', 'withdrawn'));

ALTER TABLE expressions_of_interest
  ADD COLUMN IF NOT EXISTS investor_profile_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS offerings_dates_idx ON offerings (opening_date, closing_date);
