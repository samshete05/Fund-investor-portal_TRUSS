import { FiBriefcase, FiTrendingUp, FiUsers } from 'react-icons/fi'

// Replace these demo values with an aggregate metrics endpoint when live platform data exists.
const demoStats = [
  { label: 'Portal accounts', value: '04', note: 'Fictional test investors', icon: FiUsers },
  { label: 'Companies represented', value: '04', note: 'Fictional demo companies', icon: FiBriefcase },
  { label: 'Sample funds', value: '04', note: 'Illustrative portal content', icon: FiTrendingUp },
]

export default function PlatformStats() {
  return <section className="mt-10 rounded-[14px] border border-[#e4ebe5] bg-gradient-to-r from-[#f9fbf9] to-[#f2f7f3] p-5 md:mt-12 md:p-6" id="platform-metrics" aria-labelledby="stats-title">
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><span className="text-[9px] font-bold tracking-[1.45px] text-[#668473]">PORTAL AT A GLANCE</span><h2 id="stats-title" className="mt-2 text-xl font-semibold tracking-tight text-[#203128]">A clear view of the platform</h2></div><span className="flex w-fit items-center gap-2 rounded-full border border-[#e1e9e2] bg-white px-2.5 py-2 text-[9px] text-[#829087]"><i className="h-1.5 w-1.5 rounded-full bg-[#d7a85d]"/> Fictional demo metrics</span></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{demoStats.map(({ label, value, note, icon: Icon }) => <article className="grid grid-cols-[33px_1fr] items-center gap-x-2.5 rounded-[10px] border border-[#e9eeea] bg-white p-3.5" key={label}><span className="row-span-3 grid h-8 w-8 place-items-center rounded-lg bg-[#eff5f0] text-sm text-[#64866e]"><Icon/></span><span className="text-[9px] text-[#839087]">{label}</span><strong className="mt-0.5 text-xl tracking-tight text-[#2c4033]">{value}</strong><small className="mt-0.5 text-[8px] text-[#a0aaa3]">{note}</small></article>)}</div>
    <p className="mt-3 text-[9px] leading-relaxed text-[#9aa49d]">These sample figures are placeholders and do not represent current Fundly users, companies, or funds. Connect an approved aggregate data source to display live totals.</p>
  </section>
}
