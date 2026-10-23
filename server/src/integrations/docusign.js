import { createSign } from 'node:crypto'
import { verifyDocusignSignature } from './security.js'
import { integrationMode } from './config.js'

const tokenCache = { value: null, expiresAt: 0 }

function docusignConfig() {
  const oauthBase = process.env.DOCUSIGN_OAUTH_BASE_URL ?? (integrationMode === 'sandbox' ? 'https://account-d.docusign.com' : 'https://account.docusign.com')
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY
  const userId = process.env.DOCUSIGN_USER_ID
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const templateId = process.env.DOCUSIGN_TEMPLATE_ID
  const templateRole = process.env.DOCUSIGN_TEMPLATE_ROLE_NAME
  const agreementVersion = process.env.DOCUSIGN_AGREEMENT_VERSION
  if (!integrationKey || !userId || !privateKey || !templateId || !templateRole || !agreementVersion) {
    throw new Error('DocuSign is not configured. Set JWT credentials, the approved template ID and role name, and its agreement version.')
  }
  const expectedAuthHost = integrationMode === 'sandbox' ? 'account-d.docusign.com' : 'account.docusign.com'
  if (new URL(oauthBase).hostname !== expectedAuthHost) throw new Error(`DocuSign OAuth host must be ${expectedAuthHost} for ${integrationMode} mode.`)
  return { oauthBase, integrationKey, userId, privateKey, templateId, templateRole, agreementVersion }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

async function getAccessToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value
  const { oauthBase, integrationKey, userId, privateKey } = docusignConfig()
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'RS256' }))
  const claims = base64url(JSON.stringify({ iss: integrationKey, sub: userId, aud: new URL(oauthBase).hostname, iat: now, exp: now + 3600, scope: 'signature impersonation' }))
  const unsigned = `${header}.${claims}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${signer.sign(privateKey).toString('base64url')}`
  const response = await fetch(`${oauthBase}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.access_token) throw new Error(`DocuSign authentication failed (${response.status}). Check JWT consent and credentials.`)
  tokenCache.value = body.access_token
  tokenCache.expiresAt = Date.now() + Math.min(Number(body.expires_in ?? 3600), 3500) * 1000
  return tokenCache.value
}

async function accountContext() {
  const { oauthBase } = docusignConfig()
  const token = await getAccessToken()
  const response = await fetch(`${oauthBase}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`DocuSign account lookup failed (${response.status}).`)
  const account = body.accounts?.find((candidate) => candidate.is_default) ?? body.accounts?.[0]
  if (!account?.account_id || !account?.base_uri) throw new Error('DocuSign did not return an account and API base URL.')
  const apiUrl = new URL(account.base_uri)
  if (apiUrl.protocol !== 'https:' || !apiUrl.hostname.endsWith('.docusign.net')) throw new Error('DocuSign returned an unexpected API host.')
  if (integrationMode === 'sandbox' && !apiUrl.hostname.startsWith('demo.')) throw new Error('Sandbox mode requires a DocuSign demo account.')
  if (integrationMode === 'production' && apiUrl.hostname.startsWith('demo.')) throw new Error('Production mode cannot use a DocuSign demo account.')
  return { token, accountId: account.account_id, apiBase: apiUrl.origin }
}

export async function createDocusignEnvelope({ applicationId, email, name }) {
  const { templateId, templateRole, agreementVersion } = docusignConfig()
  const { token, accountId, apiBase } = await accountContext()
  const response = await fetch(`${apiBase}/restapi/v2.1/accounts/${encodeURIComponent(accountId)}/envelopes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId,
      status: 'sent',
      transactionId: `fundly-subscription-${applicationId}-${agreementVersion}`,
      templateRoles: [{ email, name, roleName: templateRole, recipientId: '1' }],
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.envelopeId) throw new Error(`DocuSign could not send the approved template (${response.status}).`)
  return { envelopeId: body.envelopeId, agreementVersion }
}

export function verifyDocusignWebhook(rawBody, headers) {
  return verifyDocusignSignature(rawBody, headers, process.env.DOCUSIGN_CONNECT_HMAC_KEY)
}

export function parseDocusignWebhook(body) {
  const data = body?.data ?? body
  const envelopeId = data?.envelopeId ?? data?.envelopeSummary?.envelopeId
  const eventType = body?.event ?? data?.status ?? data?.envelopeSummary?.status
  const eventTime = body?.generatedDateTime ?? data?.generatedDateTime ?? null
  const normalizedType = String(eventType ?? '').toLowerCase()
  const status = ({
    'envelope-sent': 'sent', sent: 'sent',
    'recipient-viewed': 'viewed', viewed: 'viewed',
    'envelope-completed': 'signed', completed: 'signed',
    'envelope-declined': 'declined', declined: 'declined',
  })[normalizedType]
  const eventId = body?.eventId ?? body?.event_id ?? body?.eventNotificationId
    ?? `${envelopeId ?? 'unknown'}:${normalizedType}:${eventTime ?? ''}`
  if (!envelopeId || !normalizedType || !status || (eventTime && !Number.isFinite(Date.parse(eventTime)))) return null
  return { id: String(eventId), type: normalizedType, objectId: String(envelopeId), createdAt: eventTime, status }
}
