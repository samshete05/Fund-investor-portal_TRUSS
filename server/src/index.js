import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { clerkClient, clerkMiddleware, getAuth, requireAuth } from '@clerk/express'
import { pool, requireDatabase } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(cors({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173' }))
app.use(express.json())

const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY?.trim())

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'fund-investor-portal-api',
    authentication: clerkConfigured ? 'configured' : 'needs_configuration',
    message: clerkConfigured ? 'API is ready.' : 'Add CLERK_SECRET_KEY to server/.env to enable authenticated endpoints.',
  })
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fund-investor-portal-api', authentication: clerkConfigured ? 'configured' : 'needs_configuration' })
})

if (clerkConfigured) {
  app.use(clerkMiddleware())
} else {
  console.warn('CLERK_SECRET_KEY is missing. Public health routes are available; authenticated routes will return 503.')
}

function requireClerkConfiguration(_req, res, next) {
  if (!clerkConfigured) {
    return res.status(503).json({ message: 'Clerk is not configured on the server. Add CLERK_SECRET_KEY to server/.env and restart the API.' })
  }
  next()
}

async function loadClerkUser(req, res, next) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ message: 'Authentication required.' })
    req.clerkUser = await clerkClient.users.getUser(userId)
    req.portalRole = req.clerkUser.privateMetadata?.role === 'admin' ? 'admin' : 'investor'
    next()
  } catch (error) {
    next(error)
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.portalRole !== role) {
      return res.status(403).json({ message: `The ${role} dashboard is not available to this account.` })
    }
    next()
  }
}

const investorChoices = {
  investorType: ['Individual', 'Institution'],
  investmentVehicle: ['Individual', 'Personal investment vehicle (e.g. LLC)', 'Self-directed IRA', '401(k) plan', 'Revocable or living trust', 'Irrevocable trust', 'Other'],
  accreditedStatus: ['Yes', 'No', 'Not sure'],
  qualifiedPurchaser: ['Yes', 'No', 'Not sure'],
  investmentHorizon: ['Less than 3 years', '3–5 years', '5–10 years', 'More than 10 years'],
  riskComfort: ['Conservative', 'Moderate', 'Significant risk', 'Aggressive'],
  experience: ['None', 'Less than 2 years', '2–5 years', 'More than 5 years'],
  liquidWorth: ['Less than $150,000', '$150,000–$250,000', '$250,000–$500,000', 'Greater than $500,000'],
}

function text(value, maxLength = 500) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null
}

function primaryEmail(clerkUser) {
  return clerkUser.emailAddresses?.find(({ id }) => id === clerkUser.primaryEmailAddressId)
}

app.get('/api/me', requireClerkConfiguration, requireAuth(), loadClerkUser, (req, res) => {
  // Signup intent is user supplied and display-only. Authorization always uses privateMetadata.role.
  const applicationDetails = req.clerkUser.unsafeMetadata?.applicationDetails
  res.json({ userId: req.clerkUser.id, role: req.portalRole, applicationIntent: applicationDetails?.intent === 'sell' ? 'sell' : null })
})

app.post('/api/investor/application', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const clerkEmail = primaryEmail(req.clerkUser)
  if (clerkEmail?.verification?.status !== 'verified') {
    return res.status(403).json({ message: 'Verify your primary email address before submitting an investor application.' })
  }

  const firstName = text(req.clerkUser.firstName, 100)
  const lastName = text(req.clerkUser.lastName, 100)
  const email = text(clerkEmail.emailAddress, 320)
  const contact = req.body?.contact ?? {}
  const answers = req.body?.answers ?? {}
  const phone = text(contact.phone, 50)
  const postalCode = text(contact.postalCode, 30)
  const privacyAccepted = req.body?.privacyAccepted === true
  const answerValues = Object.entries(investorChoices).map(([key, allowed]) => {
    const value = text(answers[key], 160)
    return { key, value, valid: Boolean(value && allowed.includes(value)) }
  })

  if (!firstName || !lastName || !email || !phone || !postalCode || !privacyAccepted || answerValues.some(({ valid }) => !valid)) {
    return res.status(400).json({ message: 'Complete the required investor profile fields and confirm the privacy notice before submitting.' })
  }

  const values = [
    req.clerkUser.id, firstName, lastName, email, phone, text(contact.countryOfResidence, 100), postalCode,
    text(contact.referralSource, 100), text(contact.linkedInUrl, 300),
    ...answerValues.map(({ value }) => value), privacyAccepted,
  ]
  const insert = await pool.query(
    `INSERT INTO investor_applications (
       clerk_user_id, first_name, last_name, email, phone, country_of_residence, postal_code,
       referral_source, linkedin_url, investor_type, investment_vehicle, accredited_status,
       qualified_purchaser_status, investment_horizon, risk_comfort, investment_experience,
       liquid_worth_range, privacy_notice_accepted, privacy_notice_accepted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
     ON CONFLICT (clerk_user_id) DO UPDATE SET
       first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, email=EXCLUDED.email,
       phone=EXCLUDED.phone, country_of_residence=EXCLUDED.country_of_residence,
       postal_code=EXCLUDED.postal_code, referral_source=EXCLUDED.referral_source,
       linkedin_url=EXCLUDED.linkedin_url, investor_type=EXCLUDED.investor_type,
       investment_vehicle=EXCLUDED.investment_vehicle, accredited_status=EXCLUDED.accredited_status,
       qualified_purchaser_status=EXCLUDED.qualified_purchaser_status,
       investment_horizon=EXCLUDED.investment_horizon, risk_comfort=EXCLUDED.risk_comfort,
       investment_experience=EXCLUDED.investment_experience, liquid_worth_range=EXCLUDED.liquid_worth_range,
       privacy_notice_accepted=EXCLUDED.privacy_notice_accepted, privacy_notice_accepted_at=NOW(), status='pending', admin_note=NULL,
       reviewed_by_clerk_user_id=NULL, reviewed_at=NULL, updated_at=NOW()
     WHERE investor_applications.status='rejected'
     RETURNING id, status, created_at`, values,
  )

  if (insert.rowCount === 0) {
    const existing = await pool.query('SELECT id, status, created_at FROM investor_applications WHERE clerk_user_id=$1', [req.clerkUser.id])
    if (existing.rowCount > 0) return res.json({ application: existing.rows[0] })
  }
  const application = insert.rows[0]
  return res.status(201).json({ application })
})

app.get('/api/investor/application', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const result = await pool.query(
    `SELECT id, status, admin_note, reviewed_at, created_at, updated_at
     FROM investor_applications WHERE clerk_user_id=$1`, [req.clerkUser.id],
  )
  if (result.rowCount === 0) return res.status(404).json({ message: 'No investor application has been submitted yet.' })
  return res.json({ application: result.rows[0] })
})

app.get('/api/admin/applications', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, clerk_user_id, first_name, last_name, email, phone, country_of_residence,
       postal_code, referral_source, linkedin_url, investor_type, investment_vehicle,
       accredited_status, qualified_purchaser_status, investment_horizon, risk_comfort,
       investment_experience, liquid_worth_range, privacy_notice_accepted, status, admin_note,
       reviewed_by_clerk_user_id, reviewed_at, created_at, updated_at
     FROM investor_applications ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`,
  )
  return res.json({ applications: result.rows })
})

app.patch('/api/admin/applications/:id/review', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body?.status
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : ''
  if (!Number.isSafeInteger(id) || id < 1 || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Choose an application and set its status to approved or rejected.' })
  }
  if (status === 'rejected' && !note) return res.status(400).json({ message: 'Add a reason before rejecting an application.' })
  if (note.length > 1000) return res.status(400).json({ message: 'Review notes must be 1,000 characters or fewer.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query('SELECT status FROM investor_applications WHERE id=$1 FOR UPDATE', [id])
    if (current.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Investor application not found.' })
    }
    const previousStatus = current.rows[0].status
    if (previousStatus !== 'pending') {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'Only pending applications can be reviewed. Rejected applicants must submit an updated application first.' })
    }
    await client.query(
      `UPDATE investor_applications SET status=$1, admin_note=$2,
       reviewed_by_clerk_user_id=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [status, note || null, req.clerkUser.id, id],
    )
    await client.query(
      `INSERT INTO investor_application_reviews (application_id, reviewer_clerk_user_id, previous_status, new_status, note)
       VALUES ($1,$2,$3,$4,$5)`, [id, req.clerkUser.id, previousStatus, status, note || null],
    )
    await client.query('COMMIT')
    return res.json({ application: { id, status, adminNote: note || null } })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

app.get('/api/investor/dashboard', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), (_req, res) => {
  res.json({
    portfolioValue: '$2,480,500',
    annualReturn: '+12.8%',
    activeFunds: 3,
    updates: [
      { title: 'Northstar Growth Fund', detail: 'Quarterly update available', date: 'Today' },
      { title: 'Fund documents', detail: 'Your latest statements are ready', date: 'Oct 18' },
    ],
  })
})

app.get('/api/admin/dashboard', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), (_req, res) => {
  res.json({
    totalInvestors: 128,
    activeFunds: 6,
    pendingReviews: 4,
    recentActivity: [
      { title: 'Investor onboarding', detail: 'New investor account requires review', date: 'Today' },
      { title: 'Quarterly reporting', detail: 'Two fund updates are ready to publish', date: 'Yesterday' },
    ],
  })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'An unexpected server error occurred.' })
})

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`)
})
