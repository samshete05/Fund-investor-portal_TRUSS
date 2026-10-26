import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import { FiAlertCircle, FiCheck, FiClock, FiRefreshCw, FiX } from 'react-icons/fi'

type InvestorApplication = {
  id: string; clerk_user_id: string; first_name: string; last_name: string; email: string; phone: string
  country_of_residence: string | null; postal_code: string; referral_source: string | null; linkedin_url: string | null
  investor_type: string; investment_vehicle: string; accredited_status: string; qualified_purchaser_status: string
  investment_horizon: string; risk_comfort: string; investment_experience: string; liquid_worth_range: string
  status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string; reviewed_at: string | null
}
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const questions: [keyof InvestorApplication, string][] = [
  ['investor_type', 'Account type'], ['investment_vehicle', 'Investment vehicle'], ['accredited_status', 'Accredited status (self-reported)'],
  ['qualified_purchaser_status', 'Qualified Purchaser status (self-reported)'], ['investment_horizon', 'Investment horizon'],
  ['risk_comfort', 'Risk preference'], ['investment_experience', 'Investment experience'], ['liquid_worth_range', 'Liquid worth range (self-reported)'],
]

export default function AdminApplicationReview() {
  const { getToken } = useAuth()
  const [applications, setApplications] = useState<InvestorApplication[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadApplications = useCallback(async () => {
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`${apiUrl}/api/admin/applications`, { headers: { Authorization: `Bearer ${token}` } })
      const body: { applications?: InvestorApplication[]; message?: string } = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Unable to load applications.')
      setApplications(body.applications ?? [])
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load applications.') }
    finally { setLoading(false) }
  }, [getToken])

  useEffect(() => {
    // This starts an async request; the results update component state after the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadApplications()
  }, [loadApplications])

  async function review(application: InvestorApplication, status: 'approved' | 'rejected') {
    const note = notes[application.id]?.trim() ?? ''
    if (status === 'rejected' && !note) { setError(`Add a review note before rejecting ${application.first_name}'s application.`); return }
    setError(''); setSavingId(application.id)
    try {
      const token = await getToken()
      const response = await fetch(`${apiUrl}/api/admin/applications/${application.id}/review`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      })
      const body: { message?: string } = await response.json()
      if (!response.ok) throw new Error(body.message ?? 'Unable to save this review.')
      await loadApplications()
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : 'Unable to save this review.') }
    finally { setSavingId(null) }
  }

  const pendingCount = applications.filter(({ status }) => status === 'pending').length
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold tracking-widest text-slate-500">ONBOARDING</p><h2 className="mt-1 text-lg font-semibold text-slate-800">Investor applications</h2><p className="mt-1 text-xs text-slate-500">{pendingCount} pending · {applications.length} total</p></div><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => void loadApplications()}><FiRefreshCw/> Refresh</button></div>
    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">Review the applicant’s completed details, confirm the submission is complete, and document your decision. Accreditation, experience, and financial details are self-reported and have not been verified. This checklist is not a compliance or suitability determination.</div>
    {error && <p className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert"><FiAlertCircle/>{error}</p>}
    {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading applications…</p> : applications.length === 0 ? <div className="py-10 text-center"><FiClock className="mx-auto text-2xl text-slate-300"/><p className="mt-3 text-sm font-medium text-slate-700">No applications yet</p><p className="mt-1 text-xs text-slate-500">New investor submissions will appear here.</p></div> : <div className="mt-4 divide-y divide-slate-100">{applications.map((application) => <details className="group py-3" key={application.id}><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"><span><strong className="text-sm text-slate-800">{application.first_name} {application.last_name}</strong><span className="ml-2 text-xs text-slate-500">{application.email}</span></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${application.status === 'pending' ? 'bg-amber-50 text-amber-800' : application.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{application.status}</span></summary>
      <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="grid gap-x-5 gap-y-3 sm:grid-cols-2"><div><span className="text-[10px] font-semibold uppercase text-slate-400">Clerk user ID</span><p className="mt-1 break-all text-xs text-slate-700">{application.clerk_user_id}</p></div><div><span className="text-[10px] font-semibold uppercase text-slate-400">Phone</span><p className="mt-1 text-xs text-slate-700">{application.phone}</p></div><div><span className="text-[10px] font-semibold uppercase text-slate-400">Residence / postal code</span><p className="mt-1 text-xs text-slate-700">{application.country_of_residence || '—'} / {application.postal_code}</p></div>{questions.map(([field, label]) => <div key={field}><span className="text-[10px] font-semibold uppercase text-slate-400">{label}</span><p className="mt-1 text-xs text-slate-700">{application[field]}</p></div>)}</div>
        <div className="mt-4 border-t border-slate-200 pt-4"><label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor={`review-note-${application.id}`}>Review note {application.status === 'pending' && '(required to reject)'}</label><textarea id={`review-note-${application.id}`} rows={2} maxLength={1000} value={notes[application.id] ?? application.admin_note ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="Record a concise decision note" className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"/>
          {application.status === 'pending' ? <div className="mt-3 flex flex-wrap justify-end gap-2"><button disabled={savingId === application.id} onClick={() => void review(application, 'rejected')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"><FiX/> Reject</button><button disabled={savingId === application.id} onClick={() => void review(application, 'approved')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"><FiCheck/>{savingId === application.id ? 'Saving…' : 'Approve'}</button></div> : <p className="mt-3 text-[10px] text-slate-500">Reviewed {application.reviewed_at ? new Date(application.reviewed_at).toLocaleString() : ''}</p>}
        </div>
      </div>
    </details>)}</div>}
  </section>
}
