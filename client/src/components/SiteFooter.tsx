import { FiShield, FiTrendingUp } from 'react-icons/fi'

export default function SiteFooter() {
  return <footer className="mt-10 border-t border-[#e2e8e3] pt-7 md:mt-12" id="site-footer">
    <div className="grid grid-cols-2 gap-x-5 gap-y-6 pb-7 md:grid-cols-[1.2fr_.7fr_.9fr_1.3fr] md:gap-7">
      <div className="col-span-2 md:col-span-1"><a className="flex items-center gap-2 text-base font-bold text-[#23352a] no-underline" href="#top"><span className="grid h-[27px] w-[27px] place-items-center rounded-lg bg-[#244a3b] text-sm text-[#d9eadf]"><FiTrendingUp/></span> fundly</a><p className="my-2.5 max-w-[210px] text-[9px] leading-relaxed text-[#89958d]">A calm, private place to keep portal information organized.</p><div className="flex items-center gap-1.5 text-[9px] text-[#73907c]"><FiShield/> Secure access through Clerk</div></div>
      <div className="flex flex-col items-start gap-2 text-[9px] text-[#7e8b82]"><strong className="mb-0.5 text-[10px] text-[#44544a]">Explore</strong><a className="text-inherit no-underline hover:text-[#315b45] hover:underline" href="#how-it-works">How it works</a><a className="text-inherit no-underline hover:text-[#315b45] hover:underline" href="#platform-metrics">Platform overview</a><a className="text-inherit no-underline hover:text-[#315b45] hover:underline" href="#top">Back to top</a></div>
      <div className="flex flex-col items-start gap-2 text-[9px] leading-relaxed text-[#7e8b82]"><strong className="mb-0.5 text-[10px] text-[#44544a]">Portal access</strong><span>Investor sign up</span><span>Seller interest</span><span>Role access assigned by an administrator</span></div>
      <div className="col-span-2 flex flex-col gap-1 text-[9px] leading-relaxed text-[#89958d] md:col-span-1"><strong className="mb-0.5 text-[10px] text-[#44544a]">Demo information</strong><p>All companies, funds, account counts, and portfolio figures shown are fictional sample content.</p><p>This demo does not process investments, securities listings, or payments, and does not provide financial or legal advice.</p></div>
    </div>
    <div className="flex flex-col gap-1.5 border-t border-[#e9ede9] px-0.5 py-3 pb-5 text-[8px] text-[#9aa49d] sm:flex-row sm:justify-between"><span>© 2026 Fundly Investor Portal</span><span>Demo experience · Secure by design</span></div>
  </footer>
}
