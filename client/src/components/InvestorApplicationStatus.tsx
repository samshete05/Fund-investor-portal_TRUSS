import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiClock, FiFileText } from 'react-icons/fi'

type Application = { id: string; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; reviewed_at: string | null; created_at: string }
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export default function InvestorApplicationStatus() {
  const { getToken } = useAuth()
  const [application, setApplication] = useState<Application | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const token = await getToken()
        const response = await fetch(`${apiUrl}/api/investor/application`, { headers: { Authorization: `Bearer ${token}` } })
        const body: { application?: Application; message?: string } = await response.json()
        if (!response.ok && response.status !== 404) throw new Error(body.message ?? 'Unable to load application status.')
        if (active) { setApplication(body.application ?? null); setMessage(response.status === 404 ? 'No application has been submitted yet.' : '') }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Unable to load application status.') }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [getToken])

  const status = application?.status
  const Icon = status === 'approved' ? FiCheckCircle : status === 'rejected' ? FiAlertCircle : FiClock
  const tone = status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'

  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><FiFileText/></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold tracking-widest text-slate-500">INVESTOR APPLICATION</p><h2 className="mt-1 text-base font-semibold text-slate-800">Review status</h2>
      {loading ? <p className="mt-2 text-sm text-slate-500">Loading application status…</p> : status ? <><span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}><Icon/>{status}</span><p className="mt-2 text-sm leading-relaxed text-slate-600">{status === 'pending' ? 'Your application is in the admin review queue.' : status === 'approved' ? 'Your application was approved by an administrator.' : 'An administrator reviewed your application.'}</p>{application.admin_note && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Administrator note:</strong> {application.admin_note}</p>}</> : <p className="mt-2 text-sm text-slate-600">{message || 'No application has been submitted yet.'}</p>}
    </div></div>
  </section>
}
