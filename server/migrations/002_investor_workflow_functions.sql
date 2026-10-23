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
