import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { FiCheckCircle, FiRefreshCw } from 'react-icons/fi'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
type Valuation = { id: number; fund_name: string; nav_per_unit: string; valuation_as_of: string; source: string; source_data: Record<string, unknown>; submitted_by: string }

export default function AdminNavControl() {
  const { getToken } = useAuth()
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [fundName, setFundName] = useState('')
  const [navPerUnit, setNavPerUnit] = useState('')
  const [source, setSource] = useState('')
  const [sourceData, setSourceData] = useState('{}')
  const [valuationAsOf, setValuationAsOf] = useState(new Date().toISOString().slice(0, 16))
  const [positionInvestorId, setPositionInvestorId] = useState('')
  const [positionFundName, setPositionFundName] = useState('')
  const [positionUnits, setPositionUnits] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const request = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const token = await getToken()
    const response = await fetch(`${apiUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message ?? 'NAV request failed.')
    return result
  }, [getToken])

  const load = useCallback(async () => {
    try { setValuations((await request('/api/admin/nav/valuations')).valuations) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load NAV reviews.') }
  }, [request])
  useEffect(() => {
    // This starts an async fetch; state updates happen after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      let parsedSourceData: Record<string, unknown>
      try { parsedSourceData = JSON.parse(sourceData) } catch { throw new Error('Source data must be valid JSON.') }
      await request('/api/admin/nav/valuations', 'POST', { fundName, navPerUnit: Number(navPerUnit), source, valuationAsOf: new Date(valuationAsOf).toISOString(), sourceData: parsedSourceData })
      setMessage('Valuation submitted for approval. Investor values will update after approval.')
      setNavPerUnit(''); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit valuation.') } finally { setBusy(false) }
  }

  async function review(id: number, status: 'approved' | 'rejected') {
    const note = status === 'rejected' ? window.prompt('Reason for rejecting this valuation?')?.trim() : ''
    if (status === 'rejected' && !note) return
    setBusy(true); setMessage('')
    try { await request(`/api/admin/nav/valuations/${id}/review`, 'PATCH', { status, note }); await load(); setMessage(`Valuation ${status}.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to review valuation.') } finally { setBusy(false) }
  }

  async function assignPosition(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      await request('/api/admin/nav/positions', 'PUT', {
        clerkUserId: positionInvestorId,
        fundName: positionFundName,
        units: Number(positionUnits),
      })
      setMessage('Fund position saved. The investor dashboard will use it with the latest approved NAV.')
      setPositionUnits('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save fund position.')
    } finally { setBusy(false) }
  }

  return <section className="activity-panel nav-admin-panel"><div className="panel-heading"><div><span className="dashboard-eyebrow">FUND OPERATIONS</span><h2>Fund NAV valuations</h2></div><button type="button" className="action-button" onClick={() => void load()}><FiRefreshCw /> Refresh</button></div>
    <p className="nav-admin-help">Enter the fund’s approved pricing data and source details. Submissions remain pending until an administrator reviews them.</p>
    <form className="nav-entry-form" onSubmit={submit}><label>Fund name<input required maxLength={160} value={fundName} onChange={(e) => setFundName(e.target.value)} /></label><label>NAV per unit<input required type="number" min="0.00000001" step="any" value={navPerUnit} onChange={(e) => setNavPerUnit(e.target.value)} /></label><label>Valuation as of<input required type="datetime-local" value={valuationAsOf} onChange={(e) => setValuationAsOf(e.target.value)} /></label><label>Price source<input required maxLength={160} placeholder="Approved administrator, custodian, provider" value={source} onChange={(e) => setSource(e.target.value)} /></label><label className="nav-source-data">Source data / methodology JSON<textarea rows={3} value={sourceData} onChange={(e) => setSourceData(e.target.value)} /></label><button className="action-button nav-submit" disabled={busy}>Submit for approval</button></form>
    <div className="nav-pending-heading"><h3>Assign investor position</h3></div>
    <p className="nav-admin-help">Use the Clerk user ID shown in an application review to assign or update units held in a fund.</p>
    <form className="nav-entry-form" onSubmit={assignPosition}><label>Investor Clerk user ID<input required maxLength={160} value={positionInvestorId} onChange={(e) => setPositionInvestorId(e.target.value)} /></label><label>Fund name<input required maxLength={160} value={positionFundName} onChange={(e) => setPositionFundName(e.target.value)} /></label><label>Units held<input required type="number" min="0.00000001" step="any" value={positionUnits} onChange={(e) => setPositionUnits(e.target.value)} /></label><button className="action-button nav-submit" disabled={busy}>Save position</button></form>
    {message && <p className="nav-admin-message" role="status">{message}</p>}
    <div className="nav-pending-heading"><h3>Pending review</h3><span className="record-count">{valuations.length}</span></div>
    {!valuations.length ? <p className="nav-admin-help">No NAV valuations awaiting review.</p> : valuations.map((item) => <article className="nav-pending-item" key={item.id}><div><strong>{item.fund_name} · {Number(item.nav_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong><small>{item.source} · {new Date(item.valuation_as_of).toLocaleString()}</small></div><div className="nav-review-actions"><button className="action-button" disabled={busy} onClick={() => void review(item.id, 'approved')}><FiCheckCircle /> Approve</button><button className="action-button" disabled={busy} onClick={() => void review(item.id, 'rejected')}>Reject</button></div></article>)}
  </section>
}
