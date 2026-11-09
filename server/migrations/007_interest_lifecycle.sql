WITH duplicate_interests AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY investor_clerk_user_id, offering_id
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_number
  FROM expressions_of_interest
)
DELETE FROM expressions_of_interest
WHERE id IN (SELECT id FROM duplicate_interests WHERE duplicate_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS expressions_investor_offering_unique_idx
  ON expressions_of_interest (investor_clerk_user_id, offering_id);
