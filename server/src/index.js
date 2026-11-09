import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { clerkClient, clerkMiddleware, getAuth, requireAuth } from '@clerk/express'
import {
  addWorkflowAdminNote, createKycCase, ensureInvestorWorkflow, getApplicationForWorkflow, getInvestorApplication, getInvestorProfileSnapshot,
  getAdminDashboard, getInvestorNav, getInvestorWorkflow, getWorkflowForApplication, listAdminApplications, listAdminWorkflows,
  pool, processProviderWebhook, requireDatabase, reviewInvestorApplication, saveAgreementEnvelope,
  reviewFundNav, submitFundNav, submitInvestorApplication, withApplicationLock,
  createCompany, createSellerOnboarding, listMemberCompanies, listMemberOfferings, createOffering, listPublishedOfferings, createExpressionOfInterest,
  reviewCompany, getPublicStats,
  reviewOffering,
  listInvestorInterests, listAcceptedInvestorInterests, listCompanyInterests, decideExpression,
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

app.get('/api/public/stats', requireDatabase, async (_req, res) => {
  res.json(await getPublicStats())
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
    const privateRole = req.clerkUser.privateMetadata?.role
    req.portalRole = isAdminRole(privateRole)
      ? 'admin'
      : privateRole === 'company_reviewer'
        ? 'company_reviewer'
        : req.clerkUser.unsafeMetadata?.applicationDetails?.intent === 'sell' ? 'seller' : 'investor'
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

function requireCompanyDecisionRole(req, res, next) {
  if (!['seller', 'company_reviewer'].includes(req.portalRole)) {
    return res.status(403).json({ message: 'Only a company manager or assigned company reviewer can decide investor requests.' })
  }
  next()
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

  if (!firstName || !lastName || !email || !phone || !/^\+\d{7,15}$/.test(phone) || !postalCode || !privacyAccepted || answerValues.some(({ valid }) => !valid)) {
    return res.status(400).json({ message: 'Complete the required investor profile fields and confirm the privacy notice before submitting.' })
  }

  const payload = {
    clerkUserId: req.clerkUser.id, firstName, lastName, email, phone,
    countryOfResidence: text(contact.countryOfResidence, 100), postalCode,
    referralSource: text(contact.referralSource, 100), linkedInUrl: text(contact.linkedInUrl, 300),
    investorType: answerValues[0].value, investmentVehicle: answerValues[1].value === 'Other' ? text(answers.investmentVehicleOther, 200) : answerValues[1].value,
    accreditedStatus: answerValues[2].value, qualifiedPurchaserStatus: answerValues[3].value,
    investmentHorizon: answerValues[4].value, riskComfort: answerValues[5].value,
    investmentExperience: answerValues[6].value, liquidWorthRange: answerValues[7].value,
    institutionName: text(answers.institutionName, 200),
    institutionPeopleCount: answers.institutionPeopleCount === undefined ? null : Number(answers.institutionPeopleCount),
    representativeTitle: text(answers.representativeTitle, 160),
    representativePhone: text(answers.representativePhone, 50),
    privacyAccepted,
  }
  if (payload.investorType === 'Institution' && (!payload.institutionName || !Number.isSafeInteger(payload.institutionPeopleCount) || payload.institutionPeopleCount < 1 || !payload.representativeTitle || !payload.representativePhone)) {
    return res.status(400).json({ message: 'Institution investors must provide institution and representative details.' })
  }
  if (!payload.investmentVehicle) return res.status(400).json({ message: 'Specify your investment vehicle when selecting Other.' })
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

app.get('/api/investor/offerings', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const application = await getInvestorApplication(req.clerkUser.id)
  if (!application || application.status !== 'approved') return res.status(403).json({ message: 'Published offerings are available only to approved investors.' })
  return res.json({ offerings: await listPublishedOfferings(req.clerkUser.id) })
})

app.post('/api/investor/interests', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const offeringId = Number(req.body?.offeringId)
  const decision = req.body?.decision === 'not_interested' ? 'not_interested' : 'interested'
  const intendedAmount = decision === 'not_interested' ? 0 : Number(req.body?.intendedAmount)
  const note = text(req.body?.note, 1000)
  if (!Number.isSafeInteger(offeringId) || offeringId < 1 || !Number.isFinite(intendedAmount) || (decision === 'interested' && intendedAmount <= 0)) {
    return res.status(400).json({ message: 'Provide a published offering and a positive intended amount when interested.' })
  }
  const profile = await getInvestorProfileSnapshot(req.clerkUser.id)
  if (!profile) return res.status(403).json({ message: 'Your approved investor profile could not be loaded.' })
  const interest = await createExpressionOfInterest({ investorClerkUserId: req.clerkUser.id, offeringId, intendedAmount, note, investorProfileSnapshot: profile, decision })
  if (!interest) return res.status(409).json({ message: 'The offering is unavailable or your investor profile is not approved.' })
  return res.status(201).json({ interest })
})

app.get('/api/investor/interests', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  return res.json({ interests: await listInvestorInterests(req.clerkUser.id) })
})

app.post('/api/seller/companies', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  const legalName = text(req.body?.legalName, 200)
  const jurisdiction = text(req.body?.jurisdiction, 100)
  const offeringType = text(req.body?.offeringType, 100)
  const description = text(req.body?.description, 2000)
  const authorityConfirmed = req.body?.authorityConfirmed === true
  if (!legalName || !jurisdiction || !offeringType || !authorityConfirmed) return res.status(400).json({ message: 'Legal name, jurisdiction, offering type, and authority confirmation are required.' })
  return res.status(201).json({ company: await createCompany({ clerkUserId: req.clerkUser.id, legalName, jurisdiction, offeringType, description, authorityConfirmed }) })
})

app.get('/api/seller/companies', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  return res.json({ companies: await listMemberCompanies(req.clerkUser.id) })
})

app.post('/api/seller/onboarding', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  const clerkEmail = primaryEmail(req.clerkUser)
  const legalName = text(req.body?.legalName, 200)
  const displayName = text(req.body?.displayName, 200)
  const jurisdiction = text(req.body?.jurisdiction, 100)
  const sector = text(req.body?.sector, 160)
  const website = text(req.body?.website, 300)
  const representativeName = text(req.body?.representativeName, 200)
  const representativePhone = text(req.body?.representativePhone, 50)
  const offeringType = text(req.body?.offeringType, 100)
  const description = text(req.body?.description, 3000)
  const offeringName = text(req.body?.offeringName, 200)
  const summary = text(req.body?.summary, 3000)
  const riskDisclosures = text(req.body?.riskDisclosures, 3000)
  const useOfProceeds = text(req.body?.useOfProceeds, 3000)
  const instrumentType = text(req.body?.instrumentType, 100)
  const targetAmount = Number(req.body?.targetAmount)
  const minimumInterestAmount = Number(req.body?.minimumInterestAmount)
  const maximumInterestAmount = Number(req.body?.maximumInterestAmount)
  const unitPrice = req.body?.unitPrice == null || req.body?.unitPrice === '' ? null : Number(req.body.unitPrice)
  const openingDate = text(req.body?.openingDate, 20)
  const closingDate = text(req.body?.closingDate, 20)
  const eligibilityCriteria = req.body?.eligibilityCriteria && typeof req.body.eligibilityCriteria === 'object' && !Array.isArray(req.body.eligibilityCriteria) ? req.body.eligibilityCriteria : {}
  const supportingDocuments = Array.isArray(req.body?.supportingDocuments) ? req.body.supportingDocuments.slice(0, 20).map((value) => text(value, 500)).filter(Boolean) : []
  const documentReferences = Array.isArray(req.body?.documentReferences) ? req.body.documentReferences.slice(0, 20).map((value) => text(value, 500)).filter(Boolean) : []
  const proposedTerms = req.body?.proposedTerms && typeof req.body.proposedTerms === 'object' && !Array.isArray(req.body.proposedTerms) ? req.body.proposedTerms : {}
  if (!clerkEmail?.emailAddress || !legalName || !displayName || !jurisdiction || !sector || !representativeName || !representativePhone || !offeringType || !description || !offeringName || !summary || !instrumentType || !riskDisclosures || !useOfProceeds || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(minimumInterestAmount) || minimumInterestAmount <= 0 || !Number.isFinite(maximumInterestAmount) || maximumInterestAmount < minimumInterestAmount || (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice <= 0)) || !openingDate || !closingDate || !Number.isFinite(Date.parse(openingDate)) || !Number.isFinite(Date.parse(closingDate)) || Date.parse(openingDate) > Date.parse(closingDate)) {
    return res.status(400).json({ message: 'Complete the company and funding offering details before continuing.' })
  }
  return res.status(201).json({
    onboarding: await createSellerOnboarding({
      clerkUserId: req.clerkUser.id, contactEmail: clerkEmail.emailAddress, legalName, jurisdiction, offeringType,
      displayName, sector, website, representativeName, representativePhone, description, supportingDocuments,
      offeringName, summary, instrumentType, targetAmount, minimumInterestAmount, maximumInterestAmount, unitPrice,
      openingDate, closingDate, riskDisclosures, useOfProceeds, eligibilityCriteria, documentReferences, proposedTerms,
    }),
  })
})

app.get('/api/seller/offerings', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  return res.json({ offerings: await listMemberOfferings(req.clerkUser.id) })
})

app.patch('/api/seller/companies/:id/submit', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  const companyId = Number(req.params.id)
  const result = await pool.query(
    `WITH current AS (SELECT status FROM companies WHERE id=$1 AND created_by=$2)
     UPDATE companies c SET status='pending_review',updated_at=NOW()
     WHERE c.id=$1 AND c.created_by=$2 AND c.status IN ('draft','needs_changes')
     RETURNING c.*, (SELECT status FROM current) AS previous_status`,
    [companyId, req.clerkUser.id],
  )
  if (!result.rowCount) return res.status(409).json({ message: 'Company is not available for submission.' })
  await pool.query(`INSERT INTO marketplace_audit_events (actor_clerk_user_id,entity_type,entity_id,event_type,previous_status,new_status) VALUES ($1,'company',$2,'submitted',$3,'pending_review')`, [req.clerkUser.id, companyId, result.rows[0].status])
  return res.json({ company: result.rows[0] })
})

app.post('/api/seller/offerings', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  const companyId = Number(req.body?.companyId)
  const name = text(req.body?.name, 200)
  const summary = text(req.body?.summary, 2000)
  const riskDisclosures = text(req.body?.riskDisclosures, 3000)
  const useOfProceeds = text(req.body?.useOfProceeds, 2000)
  const proposedTerms = req.body?.proposedTerms && typeof req.body.proposedTerms === 'object' ? req.body.proposedTerms : {}
  const eligibilityCriteria = req.body?.eligibilityCriteria && typeof req.body.eligibilityCriteria === 'object' ? req.body.eligibilityCriteria : {}
  if (!Number.isSafeInteger(companyId) || companyId < 1 || !name || !summary || !riskDisclosures || !useOfProceeds) {
    return res.status(400).json({ message: 'Company, name, summary, risk disclosures, and use of proceeds are required.' })
  }
  const offering = await createOffering({ clerkUserId: req.clerkUser.id, companyId, name, summary, proposedTerms, eligibilityCriteria, riskDisclosures, useOfProceeds })
  if (!offering) return res.status(403).json({ message: 'You are not authorized to create offerings for this company.' })
  return res.status(201).json({ offering })
})

app.patch('/api/seller/offerings/:id/submit', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('seller'), requireDatabase, async (req, res) => {
  const offeringId = Number(req.params.id)
  const result = await pool.query(
    `WITH current AS (SELECT status FROM offerings WHERE id=$1 AND created_by=$2)
     UPDATE offerings o SET status='pending_review',updated_at=NOW()
     WHERE o.id=$1 AND o.created_by=$2 AND o.status IN ('draft','needs_changes')
     RETURNING o.*, (SELECT status FROM current) AS previous_status`,
    [offeringId, req.clerkUser.id],
  )
  if (!result.rowCount) return res.status(409).json({ message: 'Offering is not available for submission.' })
  await pool.query(`INSERT INTO marketplace_audit_events (actor_clerk_user_id,entity_type,entity_id,event_type,previous_status,new_status) VALUES ($1,'offering',$2,'submitted',$3,'pending_review')`, [req.clerkUser.id, offeringId, result.rows[0].status])
  return res.json({ offering: result.rows[0] })
})

app.get('/api/company-reviewer/interests', requireClerkConfiguration, requireAuth(), loadClerkUser, requireCompanyDecisionRole, requireDatabase, async (req, res) => {
  return res.json({ interests: await listCompanyInterests(req.clerkUser.id) })
})

app.patch('/api/company-reviewer/interests/:id', requireClerkConfiguration, requireAuth(), loadClerkUser, requireCompanyDecisionRole, requireDatabase, async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body?.status
  const note = text(req.body?.note, 1000)
  if (!Number.isSafeInteger(id) || !['accepted', 'rejected', 'under_review', 'needs_information'].includes(status)) return res.status(400).json({ message: 'Choose a valid request decision.' })
  if (['rejected', 'needs_information'].includes(status) && !note) return res.status(400).json({ message: 'Add a note for this request decision.' })
  const interest = await decideExpression({ clerkUserId: req.clerkUser.id, id, status, note })
  if (!interest) return res.status(403).json({ message: 'You are not authorized to decide this request.' })
  return res.json({ interest })
})

app.get('/api/admin/marketplace', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (_req, res) => {
  const [companies, offerings, interests] = await Promise.all([
    pool.query('SELECT * FROM companies ORDER BY created_at DESC'),
    pool.query('SELECT o.*, c.legal_name FROM offerings o JOIN companies c ON c.id=o.company_id ORDER BY o.created_at DESC'),
    pool.query(`SELECT e.*,o.name AS offering_name,c.legal_name FROM expressions_of_interest e JOIN offerings o ON o.id=e.offering_id JOIN companies c ON c.id=o.company_id ORDER BY e.created_at DESC`),
  ])
  return res.json({ companies: companies.rows, offerings: offerings.rows, interests: interests.rows })
})

app.patch('/api/admin/companies/:id/review', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body?.status
  const note = text(req.body?.note, 1000)
  if (!Number.isSafeInteger(id) || !['approved', 'needs_changes', 'rejected', 'suspended'].includes(status)) return res.status(400).json({ message: 'Choose a valid company review status.' })
  if ((status === 'needs_changes' || status === 'rejected') && !note) return res.status(400).json({ message: 'Add a message explaining the company review decision.' })
  const result = await reviewCompany({ id, status, note, reviewer: req.clerkUser.id })
  if (!result) return res.status(409).json({ message: 'Company is not available for review.' })
  return res.json({ company: result })
})

app.post('/api/admin/companies/:id/reviewers', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const companyId = Number(req.params.id)
  const reviewerClerkUserId = text(req.body?.clerkUserId, 120)
  if (!Number.isSafeInteger(companyId) || companyId < 1 || !reviewerClerkUserId) return res.status(400).json({ message: 'Provide a valid company and Clerk user ID.' })
  const result = await pool.query(
    `INSERT INTO company_memberships (company_id,clerk_user_id,role) VALUES ($1,$2,'reviewer')
     ON CONFLICT (company_id,clerk_user_id) DO UPDATE SET role='reviewer' RETURNING *`,
    [companyId, reviewerClerkUserId],
  )
  return res.status(201).json({ membership: result.rows[0] })
})

app.patch('/api/admin/offerings/:id/review', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body?.status
  const note = text(req.body?.note, 1000)
  if (!Number.isSafeInteger(id) || !['approved', 'needs_changes', 'published', 'paused', 'rejected'].includes(status)) return res.status(400).json({ message: 'Choose a valid offering review status.' })
  if ((status === 'needs_changes' || status === 'rejected') && !note) return res.status(400).json({ message: 'Add a message explaining the offering review decision.' })
  const result = await reviewOffering({ id, status, note, reviewer: req.clerkUser.id })
  if (!result) return res.status(409).json({ message: 'Offering is not available for review.' })
  return res.json({ offering: result })
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

app.get('/api/investor/dashboard', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  const nav = await getInvestorNav(req.clerkUser.id)
  const acceptedInterests = await listAcceptedInvestorInterests(req.clerkUser.id)
  const total = nav.positions.reduce((sum, position) => sum + Number(position.market_value ?? 0), 0)
  const updates = nav.positions.map((position) => ({
    title: position.fund_name,
    detail: position.market_value == null ? 'Awaiting first approved NAV' : `NAV ${Number(position.nav_per_unit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} · value ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(position.market_value))}`,
    date: position.valuation_as_of ? new Date(position.valuation_as_of).toLocaleDateString('en-US') : 'No approved valuation',
  }))
  res.json({
    portfolioValue: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total),
    activeFunds: nav.positions.length,
    updates,
    valuations: nav.history,
    acceptedInterests,
    valuationAsOf: nav.positions.reduce((latest, p) => !p.valuation_as_of || (latest && new Date(latest) > new Date(p.valuation_as_of)) ? latest : p.valuation_as_of, null),
  })
})

app.get('/api/investor/nav', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), requireDatabase, async (req, res) => {
  res.json(await getInvestorNav(req.clerkUser.id))
})

app.get('/api/admin/nav/valuations', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (_req, res) => {
  const result = await pool.query(`SELECT id, fund_name, nav_per_unit::text, valuation_as_of, source, source_data, submitted_by, status, reviewed_by, review_note, reviewed_at, created_at FROM fund_nav_valuations ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, valuation_as_of DESC LIMIT 100`)
  res.json({ valuations: result.rows })
})

app.post('/api/admin/nav/valuations', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const fundName = text(req.body?.fundName, 160)
  const source = text(req.body?.source, 160)
  const navPerUnit = req.body?.navPerUnit
  const valuationAsOf = req.body?.valuationAsOf
  if (!fundName || !source || typeof navPerUnit !== 'number' || !Number.isFinite(navPerUnit) || navPerUnit <= 0 || !valuationAsOf || !Number.isFinite(Date.parse(valuationAsOf)) || Date.parse(valuationAsOf) > Date.now()) {
    return res.status(400).json({ message: 'Provide a fund, positive NAV per unit, valid past valuation time, and price source.' })
  }
  const sourceData = req.body?.sourceData && typeof req.body.sourceData === 'object' && !Array.isArray(req.body.sourceData) ? req.body.sourceData : {}
  const valuation = await submitFundNav({ fundName, navPerUnit, valuationAsOf, source, sourceData, actor: req.clerkUser.id })
  return res.status(201).json({ valuation })
})

app.patch('/api/admin/nav/valuations/:id/review', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body?.status
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : ''
  if (!Number.isSafeInteger(id) || id < 1 || !['approved', 'rejected'].includes(status) || (status === 'rejected' && !note)) return res.status(400).json({ message: 'Choose an existing valuation and approve it or reject it with a note.' })
  const valuation = await reviewFundNav(id, status, req.clerkUser.id, note)
  if (!valuation) return res.status(409).json({ message: 'Valuation was already reviewed or does not exist.' })
  return res.json({ valuation })
})

app.put('/api/admin/nav/positions', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (req, res) => {
  const clerkUserId = text(req.body?.clerkUserId, 160)
  const fundName = text(req.body?.fundName, 160)
  const units = req.body?.units
  if (!clerkUserId || !fundName || typeof units !== 'number' || !Number.isFinite(units) || units <= 0) return res.status(400).json({ message: 'Provide the investor Clerk user ID, fund name, and positive unit balance.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const saved = await client.query(
      `INSERT INTO fund_positions (clerk_user_id,fund_name,units) VALUES ($1,$2,$3)
       ON CONFLICT (clerk_user_id,fund_name) DO UPDATE SET units=EXCLUDED.units RETURNING id, units`, [clerkUserId, fundName, units],
    )
    const position = saved.rows[0]
    const previous = await client.query(`SELECT units FROM fund_position_audit WHERE position_id=$1 ORDER BY id DESC LIMIT 1`, [position.id])
    await client.query(`INSERT INTO fund_position_audit (position_id,actor_clerk_user_id,previous_units,new_units) VALUES ($1,$2,$3,$4)`, [position.id, req.clerkUser.id, previous.rows[0]?.units ?? null, position.units])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  return res.json({ assigned: true })
})

app.get('/api/admin/dashboard', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), requireDatabase, async (_req, res) => {
  const dashboard = await getAdminDashboard()
  res.json({
    totalInvestors: dashboard.total_investors,
    pendingInvestors: dashboard.pending_investors,
    approvedInvestors: dashboard.approved_investors,
    rejectedInvestors: dashboard.rejected_investors,
    totalCompanies: dashboard.total_companies,
    pendingCompanies: dashboard.pending_companies,
    approvedCompanies: dashboard.approved_companies,
    rejectedCompanies: dashboard.rejected_companies,
    publishedOfferings: dashboard.published_offerings,
    activeInterestRequests: dashboard.active_interest_requests,
    activeFunds: dashboard.active_funds,
    pendingReviews: dashboard.pending_reviews,
    recentActivity: dashboard.recent_activity,
  })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  const status = Number.isInteger(err?.status) ? err.status : 500
  res.status(status).json({ message: status === 502 ? err.message : 'An unexpected server error occurred.' })
})

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`)
})
