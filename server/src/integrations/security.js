import { createHmac, timingSafeEqual } from 'node:crypto'

function equalSignature(expected, provided, encoding = 'hex') {
  try {
    const a = Buffer.from(expected, encoding)
    const b = Buffer.from(provided, encoding)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function verifyPersonaSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!rawBody || !header || !secret) return false
  return header.split(/\s+/).filter(Boolean).some((set) => {
    const values = Object.fromEntries(set.split(',').map((item) => {
      const separator = item.indexOf('=')
      return separator > 0 ? [item.slice(0, separator), item.slice(separator + 1)] : ['', '']
    }).filter(([key, value]) => key && value))
    const timestamp = Number(values.t)
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !values.v1) return false
    const expected = createHmac('sha256', secret).update(String(timestamp)).update('.').update(rawBody).digest('hex')
    return equalSignature(expected, values.v1)
  })
}

export function verifyDocusignSignature(rawBody, headers, secret) {
  if (!rawBody || !secret) return false
  const signatures = Object.entries(headers ?? {})
    .filter(([name, value]) => /^x-docusign-signature-\d+$/i.test(name) && typeof value === 'string')
    .map(([, value]) => value)
  if (!signatures.length) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64')
  return signatures.some((signature) => equalSignature(expected, signature, 'base64'))
}

export function kycTransitionAllowed(current, next) {
  const transitions = {
    not_started: ['pending'],
    pending: ['pending', 'needs_information', 'approved', 'rejected'],
    needs_information: ['pending', 'needs_information', 'approved', 'rejected'],
    approved: ['approved'],
    rejected: ['rejected'],
  }
  return transitions[current]?.includes(next) ?? false
}

export function agreementTransitionAllowed(current, next) {
  const transitions = {
    not_sent: ['sent'],
    sent: ['sent', 'viewed', 'signed', 'declined'],
    viewed: ['viewed', 'signed', 'declined'],
    signed: ['signed'],
    declined: ['declined'],
  }
  return transitions[current]?.includes(next) ?? false
}

export function isAdminRole(role) {
  return role === 'admin'
}

export async function claimEventOnce(claim) {
  return Boolean(await claim())
}
