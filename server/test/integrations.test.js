import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  agreementTransitionAllowed, claimEventOnce, isAdminRole, kycTransitionAllowed,
  verifyDocusignSignature, verifyPersonaSignature,
} from '../src/integrations/security.js'

const rawBody = Buffer.from('{"event":"test"}')

test('admin authorization recognizes only the server-side admin role', () => {
  assert.equal(isAdminRole('admin'), true)
  for (const role of ['investor', 'Admin', undefined, null, 'admin ']) assert.equal(isAdminRole(role), false)
})

test('Persona webhook signature validates raw body, timestamp, and rotated signatures', () => {
  const secret = 'persona-test-secret'
  const now = 1_800_000_000
  const old = createHmac('sha256', 'old-secret').update(`${now}.`).update(rawBody).digest('hex')
  const current = createHmac('sha256', secret).update(`${now}.`).update(rawBody).digest('hex')
  const header = `t=${now},v1=${old} t=${now},v1=${current}`
  assert.equal(verifyPersonaSignature(rawBody, header, secret, now), true)
  assert.equal(verifyPersonaSignature(Buffer.from('tampered'), header, secret, now), false)
  assert.equal(verifyPersonaSignature(rawBody, header, secret, now + 301), false)
  assert.equal(verifyPersonaSignature(rawBody, header, undefined, now), false)
})

test('DocuSign Connect signature validates base64 HMAC and supports signature rotation headers', () => {
  const secret = 'docusign-test-secret'
  const signature = createHmac('sha256', secret).update(rawBody).digest('base64')
  assert.equal(verifyDocusignSignature(rawBody, { 'x-docusign-signature-1': signature }, secret), true)
  assert.equal(verifyDocusignSignature(rawBody, { 'X-DocuSign-Signature-2': signature }, secret), true)
  assert.equal(verifyDocusignSignature(Buffer.from('tampered'), { 'x-docusign-signature-1': signature }, secret), false)
  assert.equal(verifyDocusignSignature(rawBody, {}, secret), false)
})

test('webhook retry claim reports duplicate events without claiming them twice', async () => {
  const received = new Set()
  const claim = () => {
    if (received.has('persona:event-1')) return false
    received.add('persona:event-1')
    return true
  }
  assert.equal(await claimEventOnce(claim), true)
  assert.equal(await claimEventOnce(claim), false)
  assert.equal(received.size, 1)
})

test('provider state transitions allow expected progress and reject frontend-like jumps', () => {
  assert.equal(kycTransitionAllowed('not_started', 'pending'), true)
  assert.equal(kycTransitionAllowed('not_started', 'approved'), false)
  assert.equal(kycTransitionAllowed('pending', 'needs_information'), true)
  assert.equal(kycTransitionAllowed('approved', 'rejected'), false)
  assert.equal(agreementTransitionAllowed('not_sent', 'sent'), true)
  assert.equal(agreementTransitionAllowed('not_sent', 'signed'), false)
  assert.equal(agreementTransitionAllowed('viewed', 'signed'), true)
  assert.equal(agreementTransitionAllowed('signed', 'declined'), false)
})
