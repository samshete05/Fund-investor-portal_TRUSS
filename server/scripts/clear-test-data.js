import 'dotenv/config'
import { clerkClient } from '@clerk/express'
import { pool } from '../src/db.js'

if (process.env.CLEAR_TEST_DATA !== 'true') {
  console.error('Set CLEAR_TEST_DATA=true to confirm deletion of all Clerk test users and user-owned data.')
  process.exitCode = 1
} else if (!process.env.CLERK_SECRET_KEY?.trim()) {
  console.error('CLERK_SECRET_KEY is missing. Add it to server/.env first.')
  process.exitCode = 1
} else if (!pool) {
  console.error('DATABASE_URL is missing. Add it to server/.env first.')
  process.exitCode = 1
} else {
  const client = await pool.connect()
  try {
    const users = await clerkClient.users.getUserList({ limit: 100 })
    const userIds = users.data.map((user) => user.id)

    await client.query('BEGIN')
    await client.query(`DELETE FROM expressions_of_interest WHERE investor_clerk_user_id <> 'demo-investor'`)
    await client.query(`DELETE FROM investor_workflow_audit WHERE application_id IN (SELECT id FROM investor_applications WHERE clerk_user_id <> 'demo-investor')`)
    await client.query(`DELETE FROM investor_provider_workflows WHERE clerk_user_id <> 'demo-investor'`)
    await client.query(`DELETE FROM investor_application_reviews WHERE application_id IN (SELECT id FROM investor_applications WHERE clerk_user_id <> 'demo-investor')`)
    await client.query(`DELETE FROM investor_applications WHERE clerk_user_id <> 'demo-investor'`)
    await client.query(`DELETE FROM fund_positions WHERE clerk_user_id <> 'demo-investor'`)
    await client.query(`DELETE FROM fund_position_audit WHERE position_id NOT IN (SELECT id FROM fund_positions)`)
    await client.query(`DELETE FROM company_memberships WHERE clerk_user_id NOT IN ('demo-seller')`)
    await client.query(`DELETE FROM companies WHERE created_by NOT IN ('demo-seller')`)
    await client.query(`DELETE FROM marketplace_audit_events WHERE actor_clerk_user_id NOT IN ('demo-seller', 'demo-admin')`)
    await client.query('DELETE FROM provider_webhook_events')
    await client.query('COMMIT')

    let deletedUsers = 0
    for (const userId of userIds) {
      await clerkClient.users.deleteUser(userId)
      deletedUsers += 1
    }

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM investor_applications WHERE clerk_user_id <> 'demo-investor') AS investor_applications,
        (SELECT COUNT(*)::int FROM fund_positions WHERE clerk_user_id <> 'demo-investor') AS fund_positions,
        (SELECT COUNT(*)::int FROM expressions_of_interest WHERE investor_clerk_user_id <> 'demo-investor') AS interests,
        (SELECT COUNT(*)::int FROM companies WHERE created_by <> 'demo-seller') AS user_companies,
        (SELECT COUNT(*)::int FROM companies WHERE created_by = 'demo-seller') AS demo_companies,
        (SELECT COUNT(*)::int FROM offerings WHERE created_by = 'demo-seller') AS demo_offerings
    `)
    console.log(JSON.stringify({ deletedUsers, remaining: counts.rows[0] }, null, 2))
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Could not clear test data:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
