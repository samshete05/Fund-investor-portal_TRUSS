import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { clerkClient, clerkMiddleware, getAuth, requireAuth } from '@clerk/express'
import {
  addWorkflowAdminNote, createKycCase, ensureInvestorWorkflow, getApplicationForWorkflow, getInvestorApplication,
  getInvestorWorkflow, getWorkflowForApplication, listAdminApplications, listAdminWorkflows,
  pool, processProviderWebhook, requireDatabase, reviewInvestorApplication, saveAgreementEnvelope,
  submitInvestorApplication, withApplicationLock,
} from './db.js'
import { assertSupportedProviders, integrationEnvironment, kycProvider, esignProvider } from './integrations/config.js'
import { createPersonaContinuationLink, createPersonaInquiry, parsePersonaWebhook, verifyPersonaWebhook } from './integrations/persona.js'
import { createDocusignEnvelope, parseDocusignWebhook, verifyDocusignWebhook } from './integrations/docusign.js'
import { isAdminRole } from './integrations/security.js'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(cors({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173' }))
app.use(express.json({ verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer) } }))

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
    req.portalRole = isAdminRole(req.clerkUser.privateMetadata?.role) ? 'admin' : 'investor'
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

  const payload = {
    clerkUserId: req.clerkUser.id, firstName, lastName, email, phone,
    countryOfResidence: text(contact.countryOfResidence, 100), postalCode,
    referralSource: text(contact.referralSource, 100), linkedInUrl: text(contact.linkedInUrl, 300),
    investorType: answerValues[0].value, investmentVehicle: answerValues[1].value,
    accreditedStatus: answerValues[2].value, qualifiedPurchaserStatus: answerValues[3].value,
    investmentHorizon: answerValues[4].value, riskComfort: answerValues[5].value,
    investmentExperience: answerValues[6].value, liquidWorthRange: answerValues[7].value,
    privacyAccepted,
  }
  const application = await submitInvestorApplication(payload)
  await ensureInvestorWorkflow(application.id, req.clerkUser.id)
  return res.status(application.status === 'pending' ? 201 : 200).json({ application })
})

app.get('/api/investor/application', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const application = await getInvestorApplication(req.clerkUser.id)
  if (!application) return res.status(404).json({ message: 'No investor application has been submitted yet.' })
  return res.json({ application })
})

app.get('/api/admin/applications', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (_req, res) => {
  const applications = await listAdminApplications()
  return res.json({ applications })
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

  const review = await reviewInvestorApplication(id, status, note || null, req.clerkUser.id)
  if (review.outcome === 'not_found') return res.status(404).json({ message: 'Investor application not found.' })
  if (review.outcome === 'not_pending') return res.status(409).json({ message: 'Only pending applications can be reviewed. Rejected applicants must submit an updated application first.' })
  return res.json({ application: review.application })
})

app.get('/api/investor/workflow', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const workflow = await getInvestorWorkflow(req.clerkUser.id)
  if (!workflow) return res.status(404).json({ message: 'Submit an investor application to view onboarding progress.' })
  return res.json({ workflow, sandboxMode: integrationEnvironment() === 'sandbox' })
})

app.post('/api/investor/workflow/kyc/start', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  assertSupportedProviders()
  const application = await pool.query('SELECT id FROM investor_applications WHERE clerk_user_id=$1', [req.clerkUser.id])
  if (!application.rowCount) return res.status(404).json({ message: 'Submit an investor application before starting verification.' })
  const applicationId = application.rows[0].id
  await ensureInvestorWorkflow(applicationId, req.clerkUser.id)
  const started = await withApplicationLock(applicationId, async (client) => {
    const current = await getApplicationForWorkflow(client, req.clerkUser.id)
    if (!current) return { error: 404, message: 'Investor application not found.' }
    if (current.status !== 'approved') return { error: 409, message: 'Verification becomes available after your investor application is approved.' }
    const workflow = await getWorkflowForApplication(client, current.id)
    if (workflow.kyc_status === 'rejected') return { error: 409, message: 'Contact the portal administrator for help with your verification case.' }
    if (workflow.kyc_status === 'approved') return { workflow }
    let caseId = workflow.kyc_case_id
    let actionUrl = null
    if (!caseId) {
      const created = await createPersonaInquiry(current.id)
      caseId = created.caseId
      actionUrl = created.actionUrl
      await createKycCase(client, {
        applicationId: current.id, clerkUserId: req.clerkUser.id, provider: kycProvider,
        caseId, environment: integrationEnvironment(), nextAction: 'Complete verification with the provider.',
      })
    } else {
      actionUrl = await createPersonaContinuationLink(caseId)
    }
    return { workflow: { ...workflow, kyc_status: 'pending', kyc_case_id: caseId, kyc_next_action: 'Complete verification with the provider.' }, actionUrl }
  })
  if (started.error) return res.status(started.error).json({ message: started.message })
  return res.json({ workflow: started.workflow, actionUrl: started.actionUrl ?? null, sandboxMode: integrationEnvironment() === 'sandbox' })
})

app.post('/api/investor/workflow/agreement/send', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  assertSupportedProviders()
  const applicationResult = await pool.query(
    `SELECT a.id, a.status, a.first_name, a.last_name, a.email FROM investor_applications a WHERE a.clerk_user_id=$1`,
    [req.clerkUser.id],
  )
  if (!applicationResult.rowCount) return res.status(404).json({ message: 'Investor application not found.' })
  const current = applicationResult.rows[0]
  if (current.status !== 'approved') return res.status(409).json({ message: 'Your investor application must be approved before signing is available.' })
  const userEmail = primaryEmail(req.clerkUser)
  if (!userEmail || userEmail.verification?.status !== 'verified') return res.status(403).json({ message: 'A verified primary email is required for electronic signing.' })
  const fullName = [current.first_name, current.last_name].filter(Boolean).join(' ')
  await ensureInvestorWorkflow(current.id, req.clerkUser.id)
  const result = await withApplicationLock(current.id, async (client) => {
    const workflow = await getWorkflowForApplication(client, current.id)
    if (workflow.kyc_status !== 'approved') return { error: 409, message: 'The agreement is available only after provider verification is approved.' }
    if (workflow.esign_envelope_id) return { workflow }
    const envelope = await createDocusignEnvelope({ applicationId: current.id, email: userEmail.emailAddress, name: fullName })
    const updated = await saveAgreementEnvelope(client, {
      applicationId: current.id, provider: esignProvider, envelopeId: envelope.envelopeId,
      environment: integrationEnvironment(), agreementVersion: envelope.agreementVersion,
      nextAction: 'Check your email for the secure agreement from the signing provider.',
    })
    return { workflow: updated }
  })
  if (result.error) return res.status(result.error).json({ message: result.message })
  return res.status(201).json({ workflow: result.workflow, sandboxMode: integrationEnvironment() === 'sandbox' })
})

app.get('/api/admin/workflows', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (_req, res) => {
  return res.json({ workflows: await listAdminWorkflows(), sandboxMode: integrationEnvironment() === 'sandbox' })
})

app.post('/api/admin/workflows/:applicationId/notes', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const applicationId = Number(req.params.applicationId)
  const note = text(req.body?.note, 1000)
  if (!Number.isSafeInteger(applicationId) || applicationId < 1 || !note) return res.status(400).json({ message: 'Enter a note of 1,000 characters or fewer.' })
  const saved = await addWorkflowAdminNote(applicationId, req.clerkUser.id, note)
  if (!saved) return res.status(404).json({ message: 'Investor application not found.' })
  return res.status(201).json({ note: saved })
})

app.post('/api/webhooks/persona', requireDatabase, async (req, res) => {
  if (!verifyPersonaWebhook(req.rawBody, req.get('persona-signature'))) return res.status(401).json({ message: 'Invalid Persona webhook signature.' })
  const event = parsePersonaWebhook(req.body)
  if (!event) return res.status(400).json({ message: 'Unsupported or incomplete Persona webhook event.' })
  const outcome = await processProviderWebhook('persona', event, 'kyc')
  return res.status(200).json({ received: true, duplicate: outcome.duplicate })
})

app.post('/api/webhooks/docusign', requireDatabase, async (req, res) => {
  if (!verifyDocusignWebhook(req.rawBody, req.headers)) return res.status(401).json({ message: 'Invalid DocuSign webhook signature.' })
  const event = parseDocusignWebhook(req.body)
  if (!event) return res.status(400).json({ message: 'Unsupported or incomplete DocuSign webhook event.' })
  const outcome = await processProviderWebhook('docusign', event, 'esign')
  return res.status(200).json({ received: true, duplicate: outcome.duplicate })
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
