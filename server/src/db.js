import pg from 'pg'

const { Pool } = pg
const connectionString = process.env.DATABASE_URL?.trim()

export const pool = connectionString
  ? new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined })
  : null

export function requireDatabase(_req, res, next) {
  if (!pool) return res.status(503).json({ message: 'Database is not configured. Set DATABASE_URL in server/.env and restart the API.' })
  next()
}
