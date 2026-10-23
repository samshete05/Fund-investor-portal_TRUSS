import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import { FiAlertCircle, FiArrowUpRight, FiCheckCircle, FiClock, FiExternalLink, FiFileText, FiRefreshCw, FiShield } from 'react-icons/fi'

type Workflow = {
  application_id: number
  application_status: string
  kyc_provider: string
  kyc_status: 'not_started' | 'pending' | 'needs_information' | 'approved' | 'rejected'
  kyc_next_action: string | null
  esign_provider: string
  esign_status: 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined'
  esign_next_action: string | null
  agreement_version: string | null
  kyc_updated_at: string | null
  kyc_decided_at: string | null
  esign_sent_at: string | null
  esign_viewed_at: string | null
  esign_signed_at: string | null
}
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export default function InvestorProviderWorkflow() {
  const { getToken } = useAuth()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [actionUrl, setActionUrl] = useState('')
  const [sandboxMode, setSandboxMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`${apiUrl}/api/investor/workflow`, { headers: { Authorization: `Bearer ${token}` } })
      const body: { workflow?: Workflow; sandboxMode?: boolean; message?: string } = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Unable to load provider workflow.')
      setWorkflow(body.workflow ?? null); setSandboxMode(body.sandboxMode ?? false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load provider workflow.') }
    finally { setLoading(false) }
  }, [getToken])

  useEffect(() => { void load() }, [load])

  async function start(path: string, key: string) {
    setBusy(key); setError(''); setNotice(''); setActionUrl('')
    try {
      const token = await getToken()
      const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
      const body: { workflow?: Workflow; actionUrl?: string | null; sandboxMode?: boolean; message?: string } = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Unable to start this step.')
      if (body.workflow) setWorkflow(body.workflow)
      if (body.actionUrl) setActionUrl(body.actionUrl)
      setSandboxMode(body.sandboxMode ?? sandboxMode)
      if (key === 'agreement') setNotice('The organization-approved agreement was sent by the signing provider. Check your verified email.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start this step.') }
    finally { setBusy('') }
  }

  if (loading) return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading verification and agreement progress…</section>
  if (!workflow) return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Submit your investor application to start secure verification and agreement steps.</section>

  const kycReady = workflow.application_status === 'approved'
  const agreementReady = kycReady && workflow.kyc_status === 'approved'
  const showKycButton = kycReady && ['not_started', 'pending', 'needs_information'].includes(workflow.kyc_status)
  const showAgreementButton = agreementReady && workflow.esign_status === 'not_sent'
  const kycText: Record<Workflow['kyc_status'], string> = {
    not_started: 'Not started', pending: 'In progress', needs_information: 'Action needed', approved: 'Provider approved', rejected: 'Provider declined',
  }
  const agreementText: Record<Workflow['esign_status'], string> = {
    not_sent: 'Not sent', sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined',
  }

  return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="provider-workflow-title">
    {sandboxMode && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold tracking-wide text-amber-900" role="status">SANDBOX MODE — Provider sandbox only. These results are not real verification and agreements are not production signatures.</div>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold tracking-widest text-slate-500">SECURE ONBOARDING</p><h2 id="provider-workflow-title" className="mt-1 text-lg font-semibold text-slate-800">Verification and agreement</h2><p className="mt-1 text-xs text-slate-500">Your progress comes from provider-signed events.</p></div><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => void load()}><FiRefreshCw/> Refresh</button></div>
    {error && <p className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert"><FiAlertCircle/>{error}</p>}{notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" role="status">{notice}</p>}
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <article className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FiShield/> Institutional verification</span><StatusPill status={workflow.kyc_status} label={kycText[workflow.kyc_status]}/></div><p className="mt-2 text-xs leading-relaxed text-slate-500">Provider: {workflow.kyc_provider}. The provider handles its configured identity/business verification and screening flow.</p><p className="mt-2 text-xs text-slate-600">Next action: {workflow.kyc_next_action ?? (kycReady ? 'Start provider verification.' : 'Available after your investor application is approved.')}</p>{workflow.kyc_updated_at && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400"><FiClock/>{workflow.kyc_decided_at ? `Decision ${new Date(workflow.kyc_decided_at).toLocaleString()}` : `Updated ${new Date(workflow.kyc_updated_at).toLocaleString()}`}</p>}{showKycButton && <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={busy === 'kyc'} onClick={() => void start('/api/investor/workflow/kyc/start', 'kyc')}>{busy === 'kyc' ? 'Connecting…' : workflow.kyc_status === 'not_started' ? 'Start verification' : 'Continue verification'} <FiArrowUpRight/></button>}{actionUrl && <a className="ml-2 mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 underline" href={actionUrl} target="_blank" rel="noreferrer">Open secure provider flow <FiExternalLink/></a>}{workflow.kyc_status === 'rejected' && <p className="mt-3 text-xs text-slate-500">Contact a portal administrator if you believe you need help or a provider exception reviewed.</p>}</article>
      <article className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FiFileText/> Subscription agreement</span><StatusPill status={workflow.esign_status} label={agreementText[workflow.esign_status]}/></div><p className="mt-2 text-xs leading-relaxed text-slate-500">Provider: {workflow.esign_provider}{workflow.agreement_version ? ` · Approved template version ${workflow.agreement_version}` : ''}</p><p className="mt-2 text-xs text-slate-600">Next action: {workflow.esign_next_action ?? (agreementReady ? 'Send the organization-approved agreement for signature.' : 'Available after provider verification is approved.')}</p>{workflow.esign_sent_at && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400"><FiClock/>{workflow.esign_signed_at ? `Signed ${new Date(workflow.esign_signed_at).toLocaleString()}` : workflow.esign_viewed_at ? `Viewed ${new Date(workflow.esign_viewed_at).toLocaleString()}` : `Sent ${new Date(workflow.esign_sent_at).toLocaleString()}`}</p>}{showAgreementButton && <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={busy === 'agreement'} onClick={() => void start('/api/investor/workflow/agreement/send', 'agreement')}>{busy === 'agreement' ? 'Sending…' : 'Send agreement'} <FiArrowUpRight/></button>}{workflow.esign_status === 'sent' || workflow.esign_status === 'viewed' ? <p className="mt-4 text-xs text-slate-600">Follow the signing provider’s secure link in your email to review and sign.</p> : null}{workflow.esign_status === 'declined' && <p className="mt-3 text-xs text-slate-500">Contact a portal administrator to review this exception.</p>}</article>
    </div>
    <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[10px] leading-relaxed text-slate-500"><FiCheckCircle className="mt-0.5 shrink-0"/> Fundly stores provider IDs, workflow status, required actions, timestamps, agreement version, and event history. Identity documents remain with the verification provider.</div>
  </section>
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const positive = ['approved', 'signed'].includes(status)
  const needs = ['needs_information', 'declined', 'rejected'].includes(status)
  const tone = positive ? 'bg-emerald-50 text-emerald-800' : needs ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone}`}>{label}</span>
}
