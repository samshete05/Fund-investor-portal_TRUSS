ALTER TABLE expressions_of_interest
  DROP CONSTRAINT IF EXISTS expressions_of_interest_status_check;

ALTER TABLE expressions_of_interest
  ADD CONSTRAINT expressions_of_interest_status_check
  CHECK (status IN ('submitted', 'under_review', 'needs_information', 'accepted', 'rejected', 'withdrawn', 'not_interested'));

ALTER TABLE expressions_of_interest
  DROP CONSTRAINT IF EXISTS expressions_of_interest_intended_amount_check;

ALTER TABLE expressions_of_interest
  ADD CONSTRAINT expressions_of_interest_intended_amount_check
  CHECK (intended_amount >= 0);

CREATE INDEX IF NOT EXISTS expressions_company_decisions_idx
  ON expressions_of_interest (offering_id, status, updated_at DESC);
