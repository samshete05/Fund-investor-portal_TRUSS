import { FiBriefcase, FiTrendingUp, FiUsers } from 'react-icons/fi'
import { useEffect, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export default function PlatformStats() {
  const [stats, setStats] = useState({ approved_investors: 0, approved_companies: 0, published_offerings: 0, active_funds: 0 })
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let active = true
    void fetch(`${apiUrl}/api/public/stats`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Public metrics unavailable')
        return response.json() as Promise<typeof stats>
      })
      .then((result) => { if (active) setStats(result) })
      .catch(() => { if (active) setAvailable(false) })
    return () => { active = false }
  }, [])

  const liveStats = [
    { label: 'Approved investors', value: stats.approved_investors, note: 'Database records', icon: FiUsers },
    { label: 'Approved companies', value: stats.approved_companies, note: 'Visible after review', icon: FiBriefcase },
    { label: 'Published offerings', value: stats.published_offerings, note: 'Available to approved investors', icon: FiTrendingUp },
  ]

  return <section className="mt-10 rounded-[14px] border border-[#e4ebe5] bg-gradient-to-r from-[#f9fbf9] to-[#f2f7f3] p-5 md:mt-12 md:p-6" id="platform-metrics" aria-labelledby="stats-title">
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><span className="text-[9px] font-bold tracking-[1.45px] text-[#668473]">PORTAL AT A GLANCE</span><h2 id="stats-title" className="mt-2 text-xl font-semibold tracking-tight text-[#203128]">A clear view of the platform</h2></div><span className="flex w-fit items-center gap-2 rounded-full border border-[#e1e9e2] bg-white px-2.5 py-2 text-[9px] text-[#829087]"><i className="h-1.5 w-1.5 rounded-full bg-[#83a18b]"/> {available ? 'Live database metrics' : 'Metrics unavailable'}</span></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{liveStats.map(({ label, value, note, icon: Icon }) => <article className="grid grid-cols-[33px_1fr] items-center gap-x-2.5 rounded-[10px] border border-[#e9eeea] bg-white p-3.5" key={label}><span className="row-span-3 grid h-8 w-8 place-items-center rounded-lg bg-[#eff5f0] text-sm text-[#64866e]"><Icon/></span><span className="text-[9px] text-[#839087]">{label}</span><strong className="mt-0.5 text-xl tracking-tight text-[#2c4033]">{value}</strong><small className="mt-0.5 text-[8px] text-[#a0aaa3]">{note}</small></article>)}</div>
    <p className="mt-3 text-[9px] leading-relaxed text-[#9aa49d]">Counts are read from approved PostgreSQL records and do not represent investment performance.</p>
  </section>
}
