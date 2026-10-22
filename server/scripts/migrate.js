import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/db.js'

if (!pool) {
  console.error('DATABASE_URL is missing. Add it to server/.env before applying migrations.')
  process.exitCode = 1
} else {
  try {
    const migrationPath = new URL('../migrations/001_investor_applications.sql', import.meta.url)
    const sql = await readFile(fileURLToPath(migrationPath), 'utf8')
    await pool.query(sql)
    console.log('Investor application tables are ready.')
  } catch (error) {
    console.error('Could not apply investor application migration:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
