import { useState } from 'react'
import { FiArrowRight, FiBriefcase, FiCheckCircle, FiCompass, FiUser } from 'react-icons/fi'

type GuideAudience = 'investor' | 'seller'
const steps: Record<GuideAudience, { title: string; text: string }[]> = {
  investor: [
    { title: 'Create your account', text: 'Sign up with your email and verify it with the code from Clerk.' },
    { title: 'Share your profile', text: 'Complete the investor intake with your self-reported preferences.' },
    { title: 'Explore the portal', text: 'Review the sample fund information and see where future updates will appear.' },
    { title: 'Keep your account current', text: 'Sign in any time to review your profile and portal updates.' },
  ],
  seller: [
    { title: 'Create your account', text: 'Choose Sell during signup and verify your email address.' },
    { title: 'Share company details', text: 'Provide basic company and share information in the seller interest form.' },
    { title: 'Request administrator access', text: 'Seller interest does not grant admin permissions. Contact a portal administrator to request access.' },
    { title: 'Use the portal when access is assigned', text: 'An administrator assigns roles through trusted Clerk settings.' },
  ],
}

export default function HomeGuide() {
  const [audience, setAudience] = useState<GuideAudience>('investor')
  return <section className="mt-10 md:mt-12" id="how-it-works" aria-labelledby="guide-title">
    <div className="mb-5"><span className="text-[9px] font-bold tracking-[1.45px] text-[#668473]">A SIMPLE START</span><h2 id="guide-title" className="my-2 text-2xl font-semibold tracking-tight text-[#203128]">How Fundly works</h2><p className="max-w-xl text-xs leading-relaxed text-[#839087]">A clear path into the portal, whether you are exploring as an investor or sharing seller interest.</p></div>
    <div className="rounded-[14px] border border-[#e5ebe6] bg-white px-5 py-5 shadow-[0_8px_28px_rgba(32,59,42,0.04)] md:px-7">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#edf4ef] text-base text-[#5d8068]"><FiCompass /></span><div><strong className="block text-xs text-[#34443a]">Choose your guide</strong><small className="mt-1 block text-[10px] text-[#98a29b]">Four straightforward steps to get oriented.</small></div></div>
      <div className="mb-1 mt-5 flex gap-2 border-b border-[#edf0ed] pb-3" role="tablist" aria-label="How to use Fundly">
        <button className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold ${audience === 'investor' ? 'bg-[#edf4ef] text-[#315b45]' : 'text-[#7f8d84] hover:bg-gray-50'}`} type="button" role="tab" aria-selected={audience === 'investor'} onClick={() => setAudience('investor')}><FiUser/> For investors</button>
        <button className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold ${audience === 'seller' ? 'bg-[#edf4ef] text-[#315b45]' : 'text-[#7f8d84] hover:bg-gray-50'}`} type="button" role="tab" aria-selected={audience === 'seller'} onClick={() => setAudience('seller')}><FiBriefcase/> For sellers</button>
      </div>
      <ol className="grid grid-cols-1 gap-x-7 md:grid-cols-2" role="tabpanel">{steps[audience].map((step, index) => <li className="grid grid-cols-[31px_1fr_17px] items-start gap-3 border-b border-[#f0f2f0] px-1 py-4" key={step.title}><span className="grid h-[27px] w-[27px] place-items-center rounded-lg bg-[#f2f6f3] text-[9px] font-bold text-[#60816a]">0{index + 1}</span><div><strong className="text-[11px] text-[#35453b]">{step.title}</strong><p className="mt-1 text-[10px] leading-relaxed text-[#839087]">{step.text}</p></div><FiCheckCircle className="mt-1.5 text-[13px] text-[#83a18b]"/></li>)}</ol>
      <p className="mt-4 flex items-center gap-2 text-[9px] leading-relaxed text-[#8a968e]"><FiArrowRight className="shrink-0 text-[#6d8b75]"/> Signup information is for this demo portal. No investments, listings, payments, or eligibility checks are processed.</p>
    </div>
  </section>
}
