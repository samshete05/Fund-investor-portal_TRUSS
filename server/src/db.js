import pg from 'pg'
import { agreementTransitionAllowed, claimEventOnce, kycTransitionAllowed } from './integrations/security.js'
import { integrationMode, kycProvider, esignProvider } from './integrations/config.js'

const { Pool } = pg
const connectionString = process.env.DATABASE_URL?.trim()

export const pool = connectionString
  ? new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined })
  : null

function database() {
  if (!pool) throw new Error('Database is not configured.')
  return pool
}

export async function submitInvestorApplication(payload) {
  const result = await database().query('SELECT * FROM portal.submit_investor_application($1::jsonb)', [JSON.stringify(payload)])
  return result.rows[0]
}

export async function ensureInvestorWorkflow(applicationId, clerkUserId) {
  await database().query(
    `INSERT INTO investor_provider_workflows (application_id, clerk_user_id, kyc_provider, esign_provider, kyc_environment, esign_environment)
     VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT (application_id) DO NOTHING`,
    [applicationId, clerkUserId, kycProvider, esignProvider, integrationMode],
  )
}

export async function getInvestorApplication(clerkUserId) {
  const result = await database().query('SELECT * FROM portal.get_investor_application($1)', [clerkUserId])
  return result.rows[0] ?? null
}

export async function listAdminApplications() {
  const result = await database().query('SELECT * FROM portal.list_admin_applications()')
  return result.rows
}

export async function getAdminDashboard() {
  const [counts, applications] = await Promise.all([
    database().query(
      `SELECT
        (SELECT COUNT(*)::int FROM investor_applications) AS total_investors,
        (SELECT COUNT(DISTINCT fund_name)::int FROM fund_positions) AS active_funds,
        (SELECT COUNT(*)::int FROM investor_applications WHERE status='pending') AS pending_reviews`,
    ),
    database().query(
      `SELECT first_name,last_name,status,created_at FROM investor_applications ORDER BY created_at DESC LIMIT 4`,
    ),
  ])
  return {
    ...counts.rows[0],
    recent_activity: applications.rows.map((application) => ({
      title: `${application.first_name} ${application.last_name}`,
      detail: `Investor application · ${application.status}`,
      date: new Date(application.created_at).toLocaleDateString('en-US'),
    })),
  }
}

export async function getInvestorNav(clerkUserId) {
  const result = await database().query(
    `SELECT p.fund_name, p.units::text AS units, v.nav_per_unit::text AS nav_per_unit,
       (p.units * v.nav_per_unit)::text AS market_value, v.valuation_as_of, v.source
     FROM fund_positions p
     LEFT JOIN LATERAL (
       SELECT nav_per_unit, valuation_as_of, source FROM fund_nav_valuations
       WHERE fund_name=p.fund_name AND status='approved'
       ORDER BY valuation_as_of DESC, id DESC LIMIT 1
     ) v ON TRUE
     WHERE p.clerk_user_id=$1 ORDER BY p.fund_name`, [clerkUserId],
  )
  const history = await database().query(
    `SELECT v.id, v.fund_name, v.nav_per_unit::text, v.valuation_as_of, v.source, v.status,
       v.submitted_by, v.reviewed_by, v.review_note, v.reviewed_at, v.created_at,
       v.source_data, COALESCE(jsonb_agg(jsonb_build_object('event', a.event_type, 'actor', a.actor_clerk_user_id, 'details', a.details, 'at', a.created_at) ORDER BY a.created_at) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb) AS audit
     FROM fund_nav_valuations v LEFT JOIN fund_nav_audit a ON a.valuation_id=v.id
     WHERE v.fund_name IN (SELECT fund_name FROM fund_positions WHERE clerk_user_id=$1)
     GROUP BY v.id ORDER BY v.valuation_as_of DESC LIMIT 50`, [clerkUserId],
  )
  return { positions: result.rows, history: history.rows }
}

export async function submitFundNav({ fundName, navPerUnit, valuationAsOf, source, sourceData, actor }) {
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO fund_nav_valuations (fund_name, nav_per_unit, valuation_as_of, source, source_data, submitted_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [fundName, navPerUnit, valuationAsOf, source, JSON.stringify(sourceData), actor],
    )
    const valuation = inserted.rows[0]
    await client.query(`INSERT INTO fund_nav_audit (valuation_id,event_type,actor_clerk_user_id,details) VALUES ($1,'submitted',$2,$3::jsonb)`, [valuation.id, actor, JSON.stringify({ source, sourceData })])
    await client.query('COMMIT')
    return valuation
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

export async function reviewFundNav(id, status, actor, note) {
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE fund_nav_valuations SET status=$2, reviewed_by=$3, review_note=$4, reviewed_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING *`, [id, status, actor, note],
    )
    if (!result.rowCount) { await client.query('ROLLBACK'); return null }
    await client.query(`INSERT INTO fund_nav_audit (valuation_id,event_type,actor_clerk_user_id,details) VALUES ($1,$2,$3,$4::jsonb)`, [id, status, actor, JSON.stringify({ note })])
    await client.query('COMMIT')
    return result.rows[0]
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

export async function reviewInvestorApplication(id, status, note, reviewer) {
  const result = await database().query('SELECT portal.review_investor_application($1, $2, $3, $4) AS result', [id, status, note, reviewer])
  return result.rows[0].result
}

export async function withApplicationLock(applicationId, operation) {
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [applicationId])
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getApplicationForWorkflow(client, clerkUserId) {
  const result = await client.query('SELECT id, status, first_name, last_name, email FROM investor_applications WHERE clerk_user_id=$1', [clerkUserId])
  return result.rows[0] ?? null
}

export async function getWorkflowForApplication(client, applicationId) {
  const result = await client.query('SELECT * FROM investor_provider_workflows WHERE application_id=$1 FOR UPDATE', [applicationId])
  return result.rows[0] ?? null
}

export async function createKycCase(client, { applicationId, clerkUserId, provider, caseId, environment, nextAction }) {
  const result = await client.query(
    `UPDATE investor_provider_workflows SET kyc_provider=$3, kyc_case_id=$4, kyc_status='pending', kyc_next_action=$5,
      kyc_environment=$6, kyc_started_at=NOW(), kyc_updated_at=NOW(), kyc_provider_updated_at=NOW(), updated_at=NOW()
     WHERE application_id=$1 AND clerk_user_id=$2 AND kyc_status='not_started' AND kyc_case_id IS NULL
     RETURNING *`,
    [applicationId, clerkUserId, provider, caseId, nextAction, environment],
  )
  if (!result.rowCount) throw new Error('A verification case already exists or could not be linked to the investor application.')
  await client.query(
    `INSERT INTO investor_workflow_audit (application_id, provider, event_type, old_status, new_status, next_action, environment)
     VALUES ($1,$2,'kyc_case_started','not_started','pending',$3,$4)`,
    [applicationId, provider, nextAction, environment],
  )
  return result.rows[0]
}

export async function saveAgreementEnvelope(client, { applicationId, provider, envelopeId, environment, agreementVersion, nextAction }) {
  const result = await client.query(
    `UPDATE investor_provider_workflows SET esign_provider=$2, esign_envelope_id=$3, esign_status='sent',
      agreement_version=$4, esign_next_action=$5, esign_sent_at=NOW(), esign_provider_updated_at=NOW(),
      esign_environment=$6, updated_at=NOW()
     WHERE application_id=$1 AND kyc_status='approved' AND esign_status='not_sent'
     RETURNING *`,
    [applicationId, provider, envelopeId, agreementVersion, nextAction, environment],
  )
  if (!result.rowCount) throw new Error('Agreement could not be started because verification is not approved or an agreement already exists.')
  await client.query(
    `INSERT INTO investor_workflow_audit (application_id, provider, event_type, old_status, new_status, next_action, agreement_version, environment)
     VALUES ($1,$2,'agreement_sent','not_sent','sent',$3,$4,$5)`,
    [applicationId, provider, nextAction, agreementVersion, environment],
  )
  return result.rows[0]
}

export async function getInvestorWorkflow(clerkUserId) {
  const application = await database().query('SELECT id FROM investor_applications WHERE clerk_user_id=$1', [clerkUserId])
  if (!application.rowCount) return null
  await ensureInvestorWorkflow(application.rows[0].id, clerkUserId)
  const result = await database().query(
    `SELECT a.id AS application_id, a.status AS application_status,
      COALESCE(w.kyc_provider, $2) AS kyc_provider, COALESCE(w.kyc_status, 'not_started') AS kyc_status,
      w.kyc_case_id, w.kyc_next_action,
      COALESCE(w.esign_provider, $3) AS esign_provider, COALESCE(w.esign_status, 'not_sent') AS esign_status,
      w.esign_envelope_id, w.esign_next_action, w.agreement_version,
      w.kyc_environment, w.esign_environment,
      w.kyc_started_at, w.kyc_updated_at, w.kyc_decided_at, w.esign_sent_at, w.esign_viewed_at, w.esign_signed_at, w.esign_declined_at
     FROM investor_applications a LEFT JOIN investor_provider_workflows w ON w.application_id=a.id
     WHERE a.clerk_user_id=$1`,
    [clerkUserId, process.env.KYC_PROVIDER ?? 'persona', process.env.ESIGN_PROVIDER ?? 'docusign'],
  )
  if (!result.rowCount) return null
  const audit = await database().query(
    `SELECT event_type, old_status, new_status, next_action, agreement_version, created_at
     FROM investor_workflow_audit WHERE application_id=$1 ORDER BY created_at DESC LIMIT 30`,
    [result.rows[0].application_id],
  )
  return { ...result.rows[0], audit: audit.rows }
}

export async function listAdminWorkflows() {
  const result = await database().query(
    `SELECT a.id AS application_id, a.clerk_user_id, a.first_name, a.last_name, a.email, a.status AS application_status,
      COALESCE(w.kyc_provider, $1) AS kyc_provider, COALESCE(w.kyc_status, 'not_started') AS kyc_status,
      w.kyc_case_id, w.kyc_next_action, COALESCE(w.esign_provider, $2) AS esign_provider,
      COALESCE(w.esign_status, 'not_sent') AS esign_status, w.esign_envelope_id, w.esign_next_action,
      w.agreement_version, w.kyc_environment, w.esign_environment,
      w.kyc_updated_at, w.esign_sent_at, w.esign_signed_at
     FROM investor_applications a LEFT JOIN investor_provider_workflows w ON w.application_id=a.id
     ORDER BY a.created_at DESC`,
    [process.env.KYC_PROVIDER ?? 'persona', process.env.ESIGN_PROVIDER ?? 'docusign'],
  )
  return result.rows
}

export async function addWorkflowAdminNote(applicationId, clerkAdminId, note) {
  const result = await database().query(
    `INSERT INTO investor_workflow_audit (application_id, actor_clerk_user_id, event_type, admin_note)
     SELECT id, $2, 'admin_exception_note', $3 FROM investor_applications WHERE id=$1
     RETURNING id, created_at`, [applicationId, clerkAdminId, note],
  )
  return result.rows[0] ?? null
}

export async function processProviderWebhook(provider, event, kind) {
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    const claimed = await claimEventOnce(async () => {
      const result = await client.query(
        `INSERT INTO provider_webhook_events (provider, provider_event_id, event_type, provider_object_id, provider_created_at)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
        [provider, event.id, event.type, event.objectId, event.createdAt ? new Date(event.createdAt) : null],
      )
      return result.rowCount > 0
    })
    if (!claimed) { await client.query('COMMIT'); return { duplicate: true } }

    const query = kind === 'kyc'
      ? `SELECT * FROM investor_provider_workflows WHERE kyc_provider=$1 AND kyc_case_id=$2 FOR UPDATE`
      : `SELECT * FROM investor_provider_workflows WHERE esign_provider=$1 AND esign_envelope_id=$2 FOR UPDATE`
    const workflowResult = await client.query(query, [provider, event.objectId])
    if (!workflowResult.rowCount) throw new Error(`No workflow is linked to provider object ${event.objectId}.`)
    const workflow = workflowResult.rows[0]
    const statusColumn = kind === 'kyc' ? 'kyc_status' : 'esign_status'
    const timestampColumn = kind === 'kyc' ? 'kyc_provider_updated_at' : 'esign_provider_updated_at'
    const environmentColumn = kind === 'kyc' ? 'kyc_environment' : 'esign_environment'
    const oldStatus = workflow[statusColumn]
    const transitionAllowed = kind === 'kyc' ? kycTransitionAllowed : agreementTransitionAllowed
    const eventTime = event.createdAt ? new Date(event.createdAt) : new Date()
    const storedTime = workflow[timestampColumn]
    const stale = storedTime && eventTime < storedTime
    const accepted = !stale && transitionAllowed(oldStatus, event.status)
    const nextStatus = accepted ? event.status : oldStatus
    const action = accepted
      ? kind === 'kyc'
        ? ({ pending: 'Complete verification with the provider.', needs_information: 'Continue with the provider and provide the requested information.', approved: 'Verification approved by provider.', rejected: 'Contact the portal administrator for help.' })[nextStatus]
        : ({ sent: 'Check your email for the secure signing link.', viewed: 'Review and sign the agreement with the provider.', signed: 'Agreement signed with the provider.', declined: 'Contact the portal administrator for help.' })[nextStatus]
      : null

    if (accepted && kind === 'kyc') {
      await client.query(
        `UPDATE investor_provider_workflows SET kyc_status=$2, kyc_next_action=$3, kyc_updated_at=NOW(),
          kyc_provider_updated_at=$4, kyc_decided_at=CASE WHEN $2 IN ('approved','rejected') THEN $4 ELSE kyc_decided_at END,
          updated_at=NOW() WHERE id=$1`,
        [workflow.id, nextStatus, action, eventTime],
      )
    } else if (accepted) {
      await client.query(
        `UPDATE investor_provider_workflows SET esign_status=$2, esign_next_action=$3,
          esign_viewed_at=CASE WHEN $2='viewed' THEN $4 ELSE esign_viewed_at END,
          esign_signed_at=CASE WHEN $2='signed' THEN $4 ELSE esign_signed_at END,
          esign_declined_at=CASE WHEN $2='declined' THEN $4 ELSE esign_declined_at END,
          esign_provider_updated_at=$4, updated_at=NOW() WHERE id=$1`,
        [workflow.id, nextStatus, action, eventTime],
      )
    }
    await client.query(
      `INSERT INTO investor_workflow_audit (
        application_id, provider, provider_event_id, event_type, old_status, new_status, next_action, agreement_version, environment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [workflow.application_id, provider, event.id, event.type, oldStatus, nextStatus, action, workflow.agreement_version, workflow[environmentColumn]],
    )
    await client.query('COMMIT')
    return { duplicate: false, accepted }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function requireDatabase(_req, res, next) {
  if (!pool) return res.status(503).json({ message: 'Database is not configured. Set DATABASE_URL in server/.env and restart the API.' })
  next()
}
