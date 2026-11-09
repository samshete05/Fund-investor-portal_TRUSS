ALTER TABLE investor_applications
  ADD COLUMN IF NOT EXISTS institution_people_count INTEGER
    CHECK (institution_people_count IS NULL OR institution_people_count > 0);
