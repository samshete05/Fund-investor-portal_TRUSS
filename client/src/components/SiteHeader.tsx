import { Show, UserButton } from '@clerk/react'
import { FiTrendingUp } from 'react-icons/fi'

export default function SiteHeader({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return <header className="relative left-1/2 z-20 w-screen -translate-x-1/2 border-t-[3px] border-[#006b68] bg-white shadow-[0_5px_5px_rgba(25,35,30,0.18)]" id="top">
    <div className="mx-auto flex h-[66px] max-w-[1440px] items-center justify-between px-5 sm:px-9">
      <a className="flex shrink-0 items-center gap-2.5 text-[22px] font-bold tracking-tight text-[#171b19] no-underline" href="#top" aria-label="Fundly home"><span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-[#087b48] text-[19px] text-white"><FiTrendingUp aria-hidden="true" /></span><span>fundly</span></a>
      <nav className="flex items-center gap-2 sm:gap-5 lg:gap-9" aria-label="Main navigation">
        <div className="hidden items-center gap-5 text-sm text-[#313936] lg:flex lg:gap-9"><a className="transition-colors hover:text-[#087b48]" href="#platform-metrics">Investments</a><a className="transition-colors hover:text-[#087b48]" href="#how-it-works">Explore</a><a className="transition-colors hover:text-[#087b48]" href="#how-it-works">How it works</a><a className="transition-colors hover:text-[#087b48]" href="#platform-metrics">Insights</a></div>
        <Show when="signed-out"><button className="rounded-[3px] border border-[#078b39] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#078b39] transition-colors hover:bg-[#f1faf3] sm:ml-1 sm:px-4" onClick={onSignIn}>Login</button><button className="rounded-[3px] bg-[#078b39] px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#06712f] sm:ml-5 sm:px-4" onClick={onSignUp}>Sign Up</button></Show>
        <Show when="signed-in"><UserButton /></Show>
      </nav>
    </div>
  </header>
}
