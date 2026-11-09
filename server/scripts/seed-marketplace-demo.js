import 'dotenv/config'
import { pool } from '../src/db.js'

if (process.env.SEED_DEMO_DATA !== 'true') {
  console.error('Set SEED_DEMO_DATA=true to confirm that you want to add fictional marketplace records.')
  process.exitCode = 1
} else if (process.env.NODE_ENV === 'production') {
  console.error('Demo data seeding is disabled when NODE_ENV=production.')
  process.exitCode = 1
} else if (!pool) {
  console.error('DATABASE_URL is missing. Add it to server/.env first.')
  process.exitCode = 1
} else {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const demos = [
      {
        legalName: 'GreenForge Energy Labs',
        email: 'samikshashete05@gmail.com',
        jurisdiction: 'United States',
        offeringType: 'Private growth funding',
        description: 'Fictional sandbox clean-energy company developing grid storage and energy-efficiency technology.',
        offeringName: 'GreenForge Grid Storage Growth Offering',
        summary: 'Fictional sandbox offering for testing the approved-company and published-offering workflow.',
        riskDisclosures: 'Fictional demo data only. This is not an investment offer, solicitation, or promise of returns.',
        useOfProceeds: 'Fictional product development, hiring, and operating expenses.',
        terms: { minimumIntendedAmount: 10000, targetAmount: 2500000, currency: 'USD' },
      },
      {
        legalName: 'HarborBridge AgriTech Ventures',
        email: 'samshete2005@gmail.com',
        jurisdiction: 'United States',
        offeringType: 'Private venture funding',
        description: 'Fictional sandbox agriculture technology company building supply-chain and farm analytics tools.',
        offeringName: 'HarborBridge AgriTech Venture Offering',
        summary: 'Fictional sandbox offering for testing investor browsing and non-binding expressions of interest.',
        riskDisclosures: 'Fictional demo data only. This is not an investment offer, solicitation, or promise of returns.',
        useOfProceeds: 'Fictional software development, field trials, and operating expenses.',
        terms: { minimumIntendedAmount: 5000, targetAmount: 1200000, currency: 'USD' },
      },
    ]

    for (const demo of demos) {
      const existingCompany = await client.query(
        'SELECT id FROM companies WHERE legal_name=$1 AND contact_email=$2 ORDER BY id LIMIT 1',
        [demo.legalName, demo.email],
      )
      const company = existingCompany.rows[0] ?? (await client.query(
        `INSERT INTO companies (
           legal_name,jurisdiction,offering_type,authority_confirmed,description,contact_email,
           status,review_note,reviewed_by,reviewed_at,created_by
         ) VALUES ($1,$2,$3,TRUE,$4,$5,'approved','Fictional marketplace demo record.','demo-admin',NOW(),'demo-seller')
         RETURNING id`,
        [demo.legalName, demo.jurisdiction, demo.offeringType, demo.description, demo.email],
      )).rows[0]
      if (!company) throw new Error(`Could not find seeded company ${demo.legalName}.`)

      await client.query(
        `INSERT INTO company_memberships (company_id,clerk_user_id,role)
         VALUES ($1,'demo-seller','representative')
         ON CONFLICT (company_id,clerk_user_id) DO NOTHING`,
        [company.id],
      )

      const existingOffering = await client.query(
        'SELECT id FROM offerings WHERE company_id=$1 AND name=$2 ORDER BY id LIMIT 1',
        [company.id, demo.offeringName],
      )
      const offering = existingOffering.rows[0] ?? (await client.query(
        `INSERT INTO offerings (
           company_id,name,summary,proposed_terms,eligibility_criteria,risk_disclosures,
           use_of_proceeds,status,review_note,reviewed_by,reviewed_at,created_by
         ) VALUES ($1,$2,$3,$4::jsonb,'{}'::jsonb,$5,$6,'published',
           'Fictional marketplace demo record.','demo-admin',NOW(),'demo-seller')
         RETURNING id`,
        [company.id, demo.offeringName, demo.summary, JSON.stringify(demo.terms), demo.riskDisclosures, demo.useOfProceeds],
      )).rows[0]
      if (!offering) throw new Error(`Could not find seeded offering ${demo.offeringName}.`)

      await client.query(
        `INSERT INTO offering_versions (offering_id,version_number,terms,eligibility_criteria,author_clerk_user_id,change_note)
         SELECT $1,1,$2::jsonb,'{}'::jsonb,'demo-seller','Initial fictional demo offering'
         WHERE NOT EXISTS (SELECT 1 FROM offering_versions WHERE offering_id=$1 AND version_number=1)`,
        [offering.id, JSON.stringify(demo.terms)],
      )
    }

    await client.query('COMMIT')
    console.log('Added or refreshed two fictional approved companies and published offerings.')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Could not seed marketplace demo data:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
