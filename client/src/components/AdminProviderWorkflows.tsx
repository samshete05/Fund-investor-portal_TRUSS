import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import { FiAlertCircle, FiRefreshCw, FiShield } from 'react-icons/fi'

type CaseRow = {
  application_id: number
  first_name: string
  last_name: string
  email: string
  application_status: string
  kyc_provider: string
  kyc_status: string
  kyc_case_id: string | null
  kyc_next_action: string | null
  esign_provider: string
  esign_status: string
  esign_envelope_id: string | null
  esign_next_action: string | null
  agreement_version: string | null
  kyc_environment: string | null
  esign_environment: string | null
  kyc_updated_at: string | null
  esign_sent_at: string | null
}
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export default function AdminProviderWorkflows() {
  const { getToken } = useAuth()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [sandbox, setSandbox] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`${apiUrl}/api/admin/workflows`, { headers: { Authorization: `Bearer ${token}` } })
      const body: { workflows?: CaseRow[]; sandboxMode?: boolean; message?: string } = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Unable to load provider cases.')
      setCases(body.workflows ?? []); setSandbox(body.sandboxMode ?? false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load provider cases.') }
    finally { setLoading(false) }
  }, [getToken])

  useEffect(() => { void load() }, [load])

  async function addNote(applicationId: number) {
    const note = notes[applicationId]?.trim()
    if (!note) { setError('Enter an exception note first.'); return }
    setBusyId(applicationId); setError(''); setNotice('')
    try {
      const token = await getToken()
      const response = await fetch(`${apiUrl}/api/admin/workflows/${applicationId}/notes`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      })
      const body: { message?: string } = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Unable to save exception note.')
      setNotes((current) => ({ ...current, [applicationId]: '' })); setNotice('Exception note saved to the audit history.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save exception note.') }
    finally { setBusyId(null) }
  }

  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="provider-cases-title">
    {sandbox && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">SANDBOX CASES — Provider sandbox activity only; no production compliance or signature result.</div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold tracking-widest text-slate-500">PROVIDER OPERATIONS</p><h2 id="provider-cases-title" className="mt-1 text-lg font-semibold text-slate-800">Verification and agreement cases</h2><p className="mt-1 text-xs text-slate-500">Review status, next actions, and record operational exceptions.</p></div><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => void load()}><FiRefreshCw/> Refresh</button></div>
    {error && <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><FiAlertCircle/>{error}</p>}{notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
    {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading provider cases…</p> : cases.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No investor applications are available.</p> : <div className="mt-4 divide-y divide-slate-100">{cases.map((item) => <details key={item.application_id} className="py-3"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"><span><strong className="text-sm text-slate-800">{item.first_name} {item.last_name}</strong><span className="ml-2 text-xs text-slate-500">{item.email}</span></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">Application: {item.application_status}</span></summary>
      <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-3"><strong className="flex items-center gap-2 text-xs text-slate-800"><FiShield/> {item.kyc_provider}: {item.kyc_status}</strong><p className="mt-2 break-all text-[10px] text-slate-500">Case ID: {item.kyc_case_id ?? 'Not created'} · {item.kyc_environment ?? 'not started'}</p><p className="mt-1 text-[10px] text-slate-600">Next action: {item.kyc_next_action ?? '—'}</p>{item.kyc_updated_at && <p className="mt-1 text-[10px] text-slate-400">Updated {new Date(item.kyc_updated_at).toLocaleString()}</p>}</div><div className="rounded-lg border border-slate-200 bg-white p-3"><strong className="text-xs text-slate-800">{item.esign_provider}: {item.esign_status}</strong><p className="mt-2 break-all text-[10px] text-slate-500">Envelope ID: {item.esign_envelope_id ?? 'Not sent'} · {item.esign_environment ?? 'not started'}</p><p className="mt-1 text-[10px] text-slate-600">Agreement version: {item.agreement_version ?? '—'}</p><p className="mt-1 text-[10px] text-slate-600">Next action: {item.esign_next_action ?? '—'}</p>{item.esign_sent_at && <p className="mt-1 text-[10px] text-slate-400">Sent {new Date(item.esign_sent_at).toLocaleString()}</p>}</div>
        <div className="md:col-span-2"><label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor={`exception-${item.application_id}`}>Operational exception note</label><textarea id={`exception-${item.application_id}`} rows={2} maxLength={1000} value={notes[item.application_id] ?? ''} onChange={(e) => setNotes((current) => ({ ...current, [item.application_id]: e.target.value }))} placeholder="Record a concise support or provider exception note. Do not enter identity document details." className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"/><div className="mt-2 flex justify-end"><button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={busyId === item.application_id} onClick={() => void addNote(item.application_id)}>{busyId === item.application_id ? 'Saving…' : 'Save audit note'}</button></div><p className="mt-2 text-[10px] leading-relaxed text-slate-500">Provider statuses are changed only by verified provider events. This screen cannot manually approve checks or mark agreements signed.</p></div>
      </div></details>)}</div>}
  </section>
}
