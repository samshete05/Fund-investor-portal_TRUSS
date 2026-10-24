import 'dotenv/config'
import { pool } from '../src/db.js'

const demoInvestorId = process.env.DEMO_INVESTOR_CLERK_USER_ID?.trim()

if (process.env.SEED_DEMO_DATA !== 'true') {
  console.error('Set SEED_DEMO_DATA=true to confirm that you want to add fictional test records.')
  process.exitCode = 1
} else if (process.env.NODE_ENV === 'production') {
  console.error('Demo data seeding is disabled when NODE_ENV=production.')
  process.exitCode = 1
} else if (!pool) {
  console.error('DATABASE_URL is missing. Add it to server/.env first.')
  process.exitCode = 1
} else if (!demoInvestorId) {
  console.error('Set DEMO_INVESTOR_CLERK_USER_ID to your test investor account ID from Clerk.')
  process.exitCode = 1
} else {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const investors = [
      ['demo-investor-001', 'Avery', 'Morgan', 'avery.morgan@example.test', 'pending'],
      ['demo-investor-002', 'Jordan', 'Lee', 'jordan.lee@example.test', 'approved'],
      ['demo-investor-003', 'Taylor', 'Patel', 'taylor.patel@example.test', 'rejected'],
      ['demo-investor-004', 'Casey', 'Rivera', 'casey.rivera@example.test', 'pending'],
    ]
    const applications = []
    for (const [clerkId, first, last, email, status] of investors) {
      const result = await client.query(
        `INSERT INTO investor_applications (
          clerk_user_id,first_name,last_name,email,phone,country_of_residence,postal_code,
          investor_type,investment_vehicle,accredited_status,qualified_purchaser_status,
          investment_horizon,risk_comfort,investment_experience,liquid_worth_range,
          privacy_notice_accepted,privacy_notice_accepted_at,status,admin_note,reviewed_by_clerk_user_id,reviewed_at
        ) VALUES ($1,$2,$3,$4,'555-0100','United States','10001','Individual','Individual','Not sure','Not sure','5–10 years','Moderate','2–5 years','$250,000–$500,000',TRUE,NOW(),$5,
          CASE WHEN $5='rejected' THEN 'Demo rejection: sample review note.' ELSE NULL END,
          CASE WHEN $5='pending' THEN NULL ELSE 'demo-admin' END,
          CASE WHEN $5='pending' THEN NULL ELSE NOW()-INTERVAL '1 day' END)
         ON CONFLICT (clerk_user_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,email=EXCLUDED.email,
          status=EXCLUDED.status,admin_note=EXCLUDED.admin_note,reviewed_by_clerk_user_id=EXCLUDED.reviewed_by_clerk_user_id,
          reviewed_at=EXCLUDED.reviewed_at,updated_at=NOW()
         RETURNING id,clerk_user_id,status`, [clerkId, first, last, email, status],
      )
      applications.push(result.rows[0])
    }

    for (const application of applications.filter(({ status }) => status !== 'pending')) {
      await client.query(
        `INSERT INTO investor_application_reviews (application_id,reviewer_clerk_user_id,previous_status,new_status,note)
         SELECT $1,'demo-admin','pending',$2,$3
         WHERE NOT EXISTS (SELECT 1 FROM investor_application_reviews WHERE application_id=$1 AND new_status=$2 AND reviewer_clerk_user_id='demo-admin')`,
        [application.id, application.status, application.status === 'rejected' ? 'Demo rejection: sample review note.' : 'Demo application approved.'],
      )
    }

    const workflowStates = [
      ['pending', 'not_sent'],
      ['approved', 'sent'],
      ['rejected', 'declined'],
      ['pending', 'not_sent'],
    ]
    for (let index = 0; index < applications.length; index += 1) {
      const application = applications[index]
      const [kycStatus, esignStatus] = workflowStates[index]
      await client.query(
        `INSERT INTO investor_provider_workflows (
           application_id,clerk_user_id,kyc_provider,kyc_case_id,kyc_status,kyc_next_action,kyc_environment,
           esign_provider,esign_envelope_id,esign_status,agreement_version,esign_next_action,esign_environment
         ) VALUES ($1,$2,'persona',$3,$4,'Fictional demo workflow state','sandbox','docusign',$5,$6,'demo-v1','Fictional demo workflow state','sandbox')
         ON CONFLICT (application_id) DO NOTHING`,
        [application.id, application.clerk_user_id,
          kycStatus === 'not_started' ? null : `demo-kyc-${index + 1}`,
          kycStatus,
          esignStatus === 'not_sent' ? null : `demo-envelope-${index + 1}`,
          esignStatus],
      )
    }

    const funds = [
      ['Northstar Growth Fund', 12.5, 10.8],
      ['Cedar Income Fund', 25, 24.4],
      ['Summit Private Credit', 8, 8.25],
      ['Harbor Real Assets', 5.75, 6.1],
    ]
    for (const [fundName, units, nav] of funds) {
      const insertedPosition = await client.query(
        `INSERT INTO fund_positions (clerk_user_id,fund_name,units) VALUES ($1,$2,$3)
         ON CONFLICT (clerk_user_id,fund_name) DO NOTHING RETURNING id,units`,
        [demoInvestorId, fundName, units],
      )
      if (insertedPosition.rowCount) {
        await client.query(
          `INSERT INTO fund_position_audit (position_id,actor_clerk_user_id,previous_units,new_units) VALUES ($1,'demo-seed',NULL,$2)`,
          [insertedPosition.rows[0].id, insertedPosition.rows[0].units],
        )
      }

      const valuation = await client.query(
        `INSERT INTO fund_nav_valuations (fund_name,nav_per_unit,valuation_as_of,source,source_data,status,submitted_by,reviewed_by,review_note,reviewed_at)
         SELECT $1,$2,NOW()-INTERVAL '1 day','Demo seed price feed',jsonb_build_object('demoSeed','fund-portal-v1','priceBasis','fictional test value'),
           'approved','demo-admin','demo-admin','Fictional test valuation; not an official NAV.',NOW()
         WHERE NOT EXISTS (SELECT 1 FROM fund_nav_valuations WHERE fund_name=$1 AND source_data->>'demoSeed'='fund-portal-v1')
         RETURNING id,source_data`, [fundName, nav],
      )
      if (valuation.rowCount) {
        await client.query(
          `INSERT INTO fund_nav_audit (valuation_id,event_type,actor_clerk_user_id,details) VALUES ($1,'submitted','demo-admin',$2::jsonb),($1,'approved','demo-admin',$2::jsonb)`,
          [valuation.rows[0].id, JSON.stringify({ demoSeed: 'fund-portal-v1', note: 'Fictional test record.' })],
        )
      }
    }

    await client.query('COMMIT')
    console.log(`Added or refreshed four fictional investor applications and four fund/NAV records. NAV positions are assigned to ${demoInvestorId}.`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Could not seed demo data:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
