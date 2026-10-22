import { Show } from '@clerk/react'
import PortalDashboard from './components/Dashboard'
import HomeGuide from './components/HomeGuide'
import PlatformStats from './components/PlatformStats'
import SiteFooter from './components/SiteFooter'
import SiteHeader from './components/SiteHeader'
import { useState } from 'react'
import { FiShield } from 'react-icons/fi'
import './dashboard.css'
import AuthModal, { type AuthMode } from './components/AuthModal'

function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)

  return <main className="page-shell">
    <SiteHeader onSignIn={() => setAuthMode('sign-in')} onSignUp={() => setAuthMode('sign-up')} />
    <Show when="signed-out"><section className="hero-card mt-8 md:mt-10"><div className="hero-copy"><span className="eyebrow">A CLEARER VIEW OF YOUR INVESTMENTS</span><h1>Your investments,<br /><span>all in one place.</span></h1><p>A private space for fund updates, portfolio documents, and the information that matters to you.</p><button className="primary-button" onClick={() => setAuthMode('sign-up')}>Create your account <span aria-hidden="true">â†’</span></button><div className="trust-note"><span className="lock-icon"><FiShield /></span> Private access for investors</div></div>
      <div className="visual-panel" aria-hidden="true"><div className="visual-topline"><span>PORTFOLIO OVERVIEW</span><span className="live-dot">â— LIVE</span></div><div className="visual-balance-label">Total portfolio value</div><div className="visual-balance">$2,480,500</div><div className="visual-growth"><span>â†—</span> 12.8% <small>this year</small></div><div className="chart-area"><div className="chart-grid"><i /><i /><i /><i /></div><svg viewBox="0 0 520 160" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#79a99c" stopOpacity=".25"/><stop offset="1" stopColor="#79a99c" stopOpacity="0"/></linearGradient></defs><path d="M0 137 C35 131 48 112 78 118 S123 130 155 100 S205 113 231 80 S281 89 311 70 S365 86 395 44 S449 58 478 30 S506 22 520 9 L520 160 L0 160Z" fill="url(#area)"/><path d="M0 137 C35 131 48 112 78 118 S123 130 155 100 S205 113 231 80 S281 89 311 70 S365 86 395 44 S449 58 478 30 S506 22 520 9" fill="none" stroke="#a5c7ba" strokeWidth="3"/></svg></div><div className="chart-dates"><span>JAN</span><span>MAR</span><span>MAY</span><span>JUL</span><span>SEP</span><span>NOW</span></div><div className="fund-row"><div className="fund-icon">N</div><div><strong>Northstar Growth Fund</strong><small>Updated today</small></div><span className="fund-return">+8.4%</span></div><div className="floating-note"><span className="note-icon">â†—</span><span><strong>Quarterly update</strong><small>New report available</small></span><span className="note-dot"/></div></div>
    </section><HomeGuide/><PlatformStats/></Show>
    <Show when="signed-in"><PortalDashboard /></Show>
    <SiteFooter />
    {authMode && <AuthModal initialMode={authMode} onClose={() => setAuthMode(null)} />}
  </main>
}

export default App
