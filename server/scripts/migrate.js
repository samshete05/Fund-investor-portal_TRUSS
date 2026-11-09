import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/db.js'

if (!pool) {
  console.error('DATABASE_URL is missing. Add it to server/.env before applying migrations.')
  process.exitCode = 1
} else {
  try {
    const migrations = [
      ['001_investor_applications.sql', 'Investor application tables are ready.'],
      ['002_investor_workflow_functions.sql', 'Investor workflow functions are ready.'],
      ['003_provider_workflows.sql', 'Provider onboarding workflows are ready.'],
      ['004_nav_valuation.sql', 'NAV valuation and audit tables are ready.'],
      ['005_marketplace.sql', 'Marketplace companies, offerings, interests, and audit tables are ready.'],
      ['006_marketplace_demo_contacts.sql', 'Marketplace company contact emails are ready.'],
      ['007_interest_lifecycle.sql', 'Investor interest lifecycle constraints are ready.'],
      ['008_marketplace_requirements.sql', 'Marketplace requirement fields and interest states are ready.'],
      ['009_marketplace_lifecycle.sql', 'Marketplace response lifecycle and company decision indexes are ready.'],
      ['010_investor_form_fields.sql', 'Investor form fields are ready.'],
    ]
    for (const [filename, message] of migrations) {
      const migrationUrl = new URL(`../migrations/${filename}`, import.meta.url)
      const sql = await readFile(fileURLToPath(migrationUrl), 'utf8')
      await pool.query(sql)
      console.log(message)
    }
  } catch (error) {
    console.error('Could not apply investor workflow migrations:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
