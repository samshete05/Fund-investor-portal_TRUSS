import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import { FiRefreshCw } from 'react-icons/fi'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
type Role = 'investor' | 'seller' | 'admin' | 'reviewer'
type RecordRow = Record<string, unknown>

export default function MarketplaceWorkspace({ role }: { role: Role }) {
  const { getToken } = useAuth()
  const [records, setRecords] = useState<RecordRow[]>([])
  const [adminInterests, setAdminInterests] = useState<RecordRow[]>([])
  const [companyInterests, setCompanyInterests] = useState<RecordRow[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [interest, setInterest] = useState({ offeringId: '', intendedAmount: '' })
  const [dismissedOfferings, setDismissedOfferings] = useState<Record<string, boolean>>({})

  const request = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const token = await getToken()
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message ?? 'Marketplace request failed.')
    return result as Record<string, unknown>
  }, [getToken])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const path = role === 'seller' ? '/api/seller/companies' : role === 'investor' ? '/api/investor/offerings' : role === 'reviewer' ? '/api/company-reviewer/interests' : '/api/admin/marketplace'
      const result = await request(path)
      if (role === 'admin') setAdminInterests((result.interests ?? []) as RecordRow[])
      const sellerOfferings = role === 'seller' ? await request('/api/seller/offerings') : null
      const sellerInterests = role === 'seller' ? await request('/api/company-reviewer/interests') : null
      if (sellerInterests) setCompanyInterests((sellerInterests.interests ?? []) as RecordRow[])
      const rows = role === 'admin'
        ? [...((result.companies ?? []) as RecordRow[]).map((row) => ({ ...row, entityType: 'company' })), ...((result.offerings ?? []) as RecordRow[]).map((row) => ({ ...row, entityType: 'offering' }))]
        : role === 'seller'
          ? [...((result.companies ?? []) as RecordRow[]).map((row) => ({ ...row, entityType: 'company' })), ...((sellerOfferings?.offerings ?? []) as RecordRow[]).map((row) => ({ ...row, entityType: 'offering' }))]
        : (result.companies ?? result.offerings ?? result.interests ?? []) as RecordRow[]
      setRecords(rows)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load marketplace data.') }
    finally { setLoading(false) }
  }, [request, role])

  useEffect(() => {
    // Load server-owned marketplace state after the authenticated role is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function submitInterest(event: SyntheticEvent, offeringId = interest.offeringId, intendedAmount = interest.intendedAmount, decision: 'interested' | 'not_interested' = 'interested') {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      await request('/api/investor/interests', 'POST', {
        offeringId: Number(offeringId),
        intendedAmount: decision === 'not_interested' ? 0 : Number(intendedAmount),
        decision,
      })
      setInterest({ offeringId: '', intendedAmount: '' })
      setDismissedOfferings((current) => ({ ...current, [offeringId]: decision === 'not_interested' }))
      setMessage(decision === 'interested' ? 'Your interest and investor ID were sent to the company manager.' : 'Your response was recorded privately.')
      await load()
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit interest.') }
    finally { setBusy(false) }
  }

  async function updateInterest(id: string, status: 'under_review' | 'needs_information' | 'accepted' | 'rejected') {
    setBusy(true); setMessage('')
    const note = reviewNotes[`interest-${id}`]?.trim() ?? ''
    try { await request(`/api/company-reviewer/interests/${id}`, 'PATCH', { status, note }); setMessage('Request decision recorded.'); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to record request decision.') }
    finally { setBusy(false) }
  }

  async function reviewMarketplace(item: RecordRow, status: string) {
    setBusy(true); setMessage('')
    try {
      const endpoint = item.entityType === 'company' ? `/api/admin/companies/${String(item.id)}/review` : `/api/admin/offerings/${String(item.id)}/review`
      const note = reviewNotes[`${String(item.entityType)}-${String(item.id)}`]?.trim() ?? ''
      await request(endpoint, 'PATCH', { status, note })
      setMessage(`${item.entityType === 'company' ? 'Company' : 'Offering'} marked ${status}.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to review marketplace record.') }
    finally { setBusy(false) }
  }

  if (role === 'seller') return <section className="mb-6">
    <Panel title="Your company submission">
      <p className="mb-4 text-sm text-slate-500">The company and funding offering details you entered during signup are already saved and have been sent for platform review.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {records.length ? records.map((item, index) => <div className="rounded-xl border border-slate-200 p-4 text-sm" key={`${String(item.entityType)}-${String(item.id ?? index)}`}>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.entityType === 'company' ? 'Company' : 'Funding offering'}</span>
          <h3 className="mt-1 font-semibold text-slate-900">{String(item.entityType === 'company' ? item.legal_name : item.name)}</h3>
          <p className="mt-2 text-xs text-slate-600">Status: <strong>{String(item.status)}</strong></p>
          {item.entityType === 'company' && <p className="text-xs text-slate-600">Company ID: {String(item.id)}</p>}
          {typeof item.review_note === 'string' && item.review_note && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><strong>Admin message:</strong> {item.review_note}</p>}
        </div>) : <p className="text-sm text-slate-500">No company information was found for this account.</p>}
      </div>
      {message && <p className="mt-4 text-sm text-slate-600" role="status">{message}</p>}
    </Panel>
    <Panel title="Investor interest requests">
      <p className="mb-4 text-xs text-slate-500">Interested investors are linked to your company and can be accepted or rejected by the company manager.</p>
      {companyInterests.length ? <div className="grid gap-3">{companyInterests.map((item) => <div className="rounded-xl border border-slate-200 p-4 text-sm" key={String(item.id)}><p><strong>{String(item.first_name)} {String(item.last_name)}</strong> · {String(item.email)}</p><p className="mt-1 text-xs text-slate-500">{String(item.offering_name)} · Intended amount: {String(item.intended_amount)} · Status: {String(item.status)}</p><textarea rows={2} maxLength={1000} value={reviewNotes[`interest-${String(item.id)}`] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [`interest-${String(item.id)}`]: event.target.value }))} placeholder="Add a decision note..." className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-xs"/>{['submitted', 'under_review', 'needs_information'].includes(String(item.status)) && <div className="mt-2 flex gap-2"><button className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" disabled={busy} onClick={() => void updateInterest(String(item.id), 'accepted')}>Approve investor</button><button className="rounded border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700" disabled={busy} onClick={() => void updateInterest(String(item.id), 'rejected')}>Reject</button></div>}</div>)}</div> : <p className="text-sm text-slate-500">No investor interest requests yet.</p>}
    </Panel>
  </section>

  if (role === 'investor') return <section className="mb-6 grid gap-5">
    <Panel title="Companies seeking funding">
      <p className="mb-4 text-xs text-slate-500">Review each approved company and its funding terms. Your response is sent only to that company manager.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {records.length ? records.map((item) => {
          const id = String(item.id)
          const status = String(item.interest_status ?? '')
          const dismissed = dismissedOfferings[id]
          const hasRequest = Boolean(status)
          const blocked = hasRequest || dismissed
          return <article className={`rounded-xl border p-4 text-sm ${dismissed ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`} key={id}>
            <div className="flex items-start justify-between gap-3"><div><strong>{String(item.legal_name)}</strong><h3 className="mt-1 font-semibold">{String(item.name)}</h3></div>{status && <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status === 'accepted' ? 'bg-cyan-50 text-cyan-800' : status === 'rejected' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>{status === 'submitted' ? 'Awaiting company review' : status}</span>}</div>
            <p className="mt-2 text-slate-600">{String(item.summary)}</p>
            <p className="mt-2 text-xs text-slate-500">Instrument: {String(item.instrument_type ?? 'Not specified')} · Sector: {String(item.sector ?? 'Not specified')}</p>
            <p className="mt-1 text-xs text-slate-500">Target: {String(item.target_amount ?? 'Not specified')} · Interest range: {String(item.minimum_interest_amount ?? '—')} to {String(item.maximum_interest_amount ?? '—')}</p>
            <p className="mt-1 text-xs text-slate-500">Open: {String(item.opening_date ?? 'Not specified')} · Close: {String(item.closing_date ?? 'Not specified')}</p>
            <p className="mt-2 text-xs text-slate-500">Funding use: {String(item.use_of_proceeds)}</p>
            <p className="mt-1 text-xs text-slate-500">Eligibility and risk: {String(item.risk_disclosures)}</p>
            {Array.isArray(item.document_references) && item.document_references.length > 0 && <div className="mt-2 text-xs text-slate-500"><strong>Documents:</strong>{item.document_references.map((reference) => <span className="ml-2" key={String(reference)}>{String(reference)}</span>)}</div>}
            {typeof item.interest_decision_note === 'string' && item.interest_decision_note && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Company message: {item.interest_decision_note}</p>}
            {!blocked && <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Intended amount<input required min="0.01" type="number" value={interest.offeringId === id ? interest.intendedAmount : ''} onChange={(event) => setInterest({ offeringId: id, intendedAmount: event.target.value })} className="w-36 rounded border border-slate-200 p-2 font-normal" /></label>
              <button type="button" className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60" disabled={busy || interest.offeringId !== id || !interest.intendedAmount} onClick={(event) => void submitInterest(event, id, interest.intendedAmount)}>Interested</button>
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600" disabled={busy} onClick={(event) => void submitInterest(event, id, '0', 'not_interested')}>Not interested</button>
            </div>}
            {dismissed && <p className="mt-3 text-xs text-slate-500">You marked this company as not interested.</p>}
            {status === 'rejected' && <p className="mt-3 text-xs text-slate-500">This company declined your request. You cannot submit another request to this company.</p>}
            {status === 'accepted' && <p className="mt-3 text-xs font-semibold text-cyan-800">Accepted. Next funding steps will appear in your investor dashboard.</p>}
          </article>
        }) : <p className="text-sm text-slate-500">No published company offerings are available.</p>}
      </div>
    </Panel>
    {message && <p className="text-sm text-slate-600" role="status">{message}</p>} 
  </section>

  return <section className="mb-6">
    {role === 'admin' && <Panel title="Investor-company requests">
      <p className="mb-4 text-xs text-slate-500">Each request links an investor to a company and offering. Company managers make the decision; admins can monitor the persisted status here.</p>
      {adminInterests.length ? <div className="grid gap-3">{adminInterests.map((item) => <article className="rounded-xl border border-slate-200 p-4 text-sm" key={String(item.id)}>
        <p><strong>{String(item.legal_name)}</strong> · {String(item.offering_name)}</p>
        <p className="mt-1 text-xs text-slate-500">Investor ID: {String(item.investor_clerk_user_id)} · Intended amount: {String(item.intended_amount)} · Status: <strong>{String(item.status)}</strong></p>
        <p className="mt-1 text-xs text-slate-500">Submitted: {new Date(String(item.created_at)).toLocaleString()}{item.decided_at ? ` · Decided: ${new Date(String(item.decided_at)).toLocaleString()}` : ''}</p>
        {typeof item.decision_note === 'string' && item.decision_note && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">Decision note: {item.decision_note}</p>}
      </article>)}</div> : <p className="text-sm text-slate-500">No investor-company requests have been submitted.</p>}
    </Panel>}
    <Panel title={role === 'reviewer' ? 'Company request queue' : 'Marketplace review queue'}><div className="mb-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Each review decision applies only to the selected company or offering.</p><button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60" disabled={loading || busy} onClick={() => void load()}><FiRefreshCw className={loading ? 'animate-spin' : ''}/> Refresh</button></div><div className="grid gap-3">{loading ? <p className="py-8 text-center text-sm text-slate-500">Loading marketplace records...</p> : records.length ? records.map((item, index) => { const key = `${String(item.entityType ?? 'record')}-${String(item.id ?? index)}`; const actionable = role === 'admin' && ((item.entityType === 'company' && ['pending_review', 'needs_changes'].includes(String(item.status))) || (item.entityType === 'offering' && ['pending_review', 'needs_changes', 'approved', 'published', 'paused'].includes(String(item.status)))); const reviewerActionable = role === 'reviewer' && ['submitted', 'under_review', 'needs_information'].includes(String(item.status)); return <div className="rounded-xl border border-slate-200 p-4 text-sm" key={key}>{role === 'reviewer' ? <><p><strong>{String(item.legal_name)}</strong> · {String(item.offering_name)}</p><p className="mt-1 text-xs text-slate-500">Investor: {String(item.first_name)} {String(item.last_name)} · {String(item.email)} · {String(item.investor_type === 'Institution' ? item.institution_name : 'Individual')}</p><p className="mt-1 text-xs text-slate-500">Amount: {String(item.intended_amount)} · Status: {String(item.status)}</p><textarea rows={2} maxLength={1000} value={reviewNotes[`interest-${String(item.id)}`] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [`interest-${String(item.id)}`]: event.target.value }))} placeholder="Add a reviewer note..." className="mt-3 w-full rounded-lg border border-slate-200 p-2 text-xs"/>{reviewerActionable && <div className="mt-2 flex flex-wrap gap-2"><button className="rounded border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700" disabled={busy} onClick={() => void updateInterest(String(item.id), 'under_review')}>Under review</button><button className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700" disabled={busy} onClick={() => void updateInterest(String(item.id), 'needs_information')}>Request information</button><button className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white" disabled={busy} onClick={() => void updateInterest(String(item.id), 'accepted')}>Accept</button><button className="rounded border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700" disabled={busy} onClick={() => void updateInterest(String(item.id), 'rejected')}>Reject</button></div>}</> : <>{Object.entries(item).filter(([field]) => field !== 'entityType').slice(0, 7).map(([field, value]) => <p key={field}><strong>{field}:</strong> {String(value)}</p>)}{actionable && <div className="mt-4 border-t border-slate-100 pt-3"><label className="block text-xs font-semibold text-slate-600" htmlFor={`review-note-${key}`}>Message to company</label><textarea id={`review-note-${key}`} rows={3} maxLength={1000} value={reviewNotes[key] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder="Explain what is approved or what must change..." className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"/><div className="mt-3 flex flex-wrap gap-2"><button className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void reviewMarketplace(item, item.entityType === 'company' ? 'approved' : item.status === 'approved' ? 'published' : 'approved')}>{item.entityType === 'company' ? 'Approve company' : item.status === 'approved' ? 'Publish offering' : 'Approve offering'}</button><button className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-60" disabled={busy} onClick={() => void reviewMarketplace(item, 'needs_changes')}>Needs changes</button><button className="rounded border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60" disabled={busy} onClick={() => void reviewMarketplace(item, 'rejected')}>Reject</button></div></div>}</>}</div> }) : <p className="text-sm text-slate-500">No marketplace records.</p>}</div></Panel>{message && <p className="mt-2 text-sm text-slate-600" role="status">{message}</p>}</section>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>{children}</section>
}
