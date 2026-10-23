import { verifyPersonaSignature } from './security.js'

const apiBase = process.env.PERSONA_API_BASE_URL ?? 'https://api.withpersona.com/api/v1'
const apiVersion = process.env.PERSONA_API_VERSION ?? '2026-09-29'

function config() {
  const prefix = process.env.INTEGRATION_MODE === 'production' ? 'PERSONA_PRODUCTION' : 'PERSONA_SANDBOX'
  const apiKey = process.env[`${prefix}_API_KEY`]
  const templateId = process.env.PERSONA_INQUIRY_TEMPLATE_ID
  const environmentId = process.env[`${prefix}_ENVIRONMENT_ID`]
  if (!apiKey || !templateId || !environmentId) throw new Error('Persona is not configured. Set its API key, inquiry template ID, and environment ID.')
  return { apiKey, templateId, environmentId }
}

async function personaRequest(path, options = {}) {
  const { apiKey, environmentId } = config()
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Persona-Version': apiVersion,
      ...(options.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Persona request failed (${response.status}).`)
  const responseEnvironment = response.headers.get('persona-environment-id')
  if (responseEnvironment !== environmentId) throw new Error('Persona environment does not match the configured integration mode.')
  return body
}

export async function createPersonaInquiry(applicationId) {
  const { templateId } = config()
  const body = await personaRequest('/inquiries', {
    method: 'POST',
    headers: { 'Idempotency-Key': `fundly-investor-${applicationId}` },
    body: JSON.stringify({ data: { attributes: { 'inquiry-template-id': templateId, 'reference-id': `application-${applicationId}` } } }),
  })
  const inquiryId = body.data?.id
  if (!inquiryId) throw new Error('Persona did not return an inquiry ID.')
  const actionUrl = body.meta?.['one-time-link'] ?? body.meta?.['one-time-link-short'] ?? null
  return { caseId: inquiryId, actionUrl }
}

export async function createPersonaContinuationLink(caseId) {
  const body = await personaRequest(`/inquiries/${encodeURIComponent(caseId)}/generate-one-time-link`, { method: 'POST', body: JSON.stringify({}) })
  return body.meta?.['one-time-link'] ?? body.meta?.['one-time-link-short'] ?? null
}

export function verifyPersonaWebhook(rawBody, signature) {
  return verifyPersonaSignature(rawBody, signature, process.env.PERSONA_WEBHOOK_SECRET)
}

export function parsePersonaWebhook(body) {
  const event = body?.data
  const payload = event?.attributes?.payload?.data
  const eventType = event?.attributes?.name
  const status = payload?.attributes?.status
  const statusMap = {
    'inquiry.approved': 'approved',
    'inquiry.declined': 'rejected',
    'inquiry.needs-retry': 'needs_information',
    'inquiry.needs-retry-information': 'needs_information',
    'inquiry.completed': 'pending',
    'inquiry.marked-for-review': 'pending',
    'inquiry.started': 'pending',
  }
  const normalizedStatus = statusMap[eventType] ?? ({
    approved: 'approved', declined: 'rejected', needs_retry: 'needs_information',
    needs_information: 'needs_information', pending: 'pending', completed: 'pending',
  })[status]
  if (!event?.id || !eventType || !payload?.id || !normalizedStatus) return null
  const createdAt = event.attributes?.['created-at'] ?? null
  if (createdAt && !Number.isFinite(Date.parse(createdAt))) return null
  return {
    id: event.id,
    type: eventType,
    objectId: payload.id,
    createdAt,
    status: normalizedStatus,
  }
}
