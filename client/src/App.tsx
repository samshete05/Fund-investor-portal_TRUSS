import { Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import {
  FiActivity,
  FiAlertCircle,
  FiArrowDownRight,
  FiArrowRight,
  FiArrowUpRight,
  FiBriefcase,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiFileText,
  FiHome,
  FiInbox,
  FiRefreshCw,
  FiShield,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'
import './dashboard.css'

type PortalRole = 'investor' | 'admin'
type ActivityItem = { title: string; detail: string; date: string }
type DashboardData = {
  portfolioValue?: string
  annualReturn?: string
  activeFunds?: number
  totalInvestors?: number
  pendingReviews?: number
  updates?: ActivityItem[]
  recentActivity?: ActivityItem[]
}
type Metric = { label: string; value: string | number; note: string; icon: typeof FiDollarSign; tone: string; movement?: 'up' | 'down' }

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function PortalDashboard() {
  const { getToken } = useAuth()
  const [role, setRole] = useState<PortalRole | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const loadDashboard = useCallback(async () => {
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }
      const profileResponse = await fetch(`${apiUrl}/api/me`, { headers })
      const profile: { role?: PortalRole; message?: string } = await profileResponse.json()
      if (!profileResponse.ok || (profile.role !== 'investor' && profile.role !== 'admin')) {
        throw new Error(profile.message ?? 'We could not confirm your account role.')
      }

      const dashboardResponse = await fetch(`${apiUrl}/api/${profile.role}/dashboard`, { headers })
      const dashboardData: DashboardData & { message?: string } = await dashboardResponse.json()
      if (!dashboardResponse.ok) throw new Error(dashboardData.message ?? 'We could not load your dashboard.')

      setRole(profile.role)
      setDashboard(dashboardData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to connect to the portal API.')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    // This starts an async fetch; its state updates happen after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
  }, [loadDashboard, reloadKey])

  function refreshDashboard() {
    setError('')
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  if (loading) return <DashboardLoading />
  if (error || !role || !dashboard) {
    return <DashboardError message={error || 'Your dashboard is not available right now.'} onRetry={refreshDashboard} />
  }

  return <DashboardContent role={role} data={dashboard} onRefresh={refreshDashboard} />
}

function DashboardLoading() {
  return <div className="dashboard-layout" role="status" aria-label="Loading dashboard">
    <aside className="dashboard-sidebar"><div className="sidebar-label">WORKSPACE</div><div className="sidebar-link is-active"><FiHome /> Overview</div><div className="sidebar-security"><FiShield /><span><strong>Secure portal</strong><small>Your account is protected</small></span></div></aside>
    <main className="dashboard-main"><div className="dashboard-toolbar"><span className="toolbar-kicker">ACCOUNT OVERVIEW</span><span className="loading-pill">Loading…</span></div><div className="dashboard-title-block"><div className="skeleton skeleton-kicker"/><div className="skeleton skeleton-title"/><div className="skeleton skeleton-description"/></div><div className="metric-grid">{[1, 2, 3].map((item) => <div className="metric-card skeleton-card" key={item}><div className="skeleton skeleton-kicker"/><div className="skeleton skeleton-value"/><div className="skeleton skeleton-description"/></div>)}</div><div className="skeleton skeleton-table"/></main>
  </div>
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="dashboard-layout">
    <aside className="dashboard-sidebar"><div className="sidebar-label">WORKSPACE</div><div className="sidebar-link is-active"><FiHome /> Overview</div><div className="sidebar-security"><FiShield /><span><strong>Secure portal</strong><small>Your account is protected</small></span></div></aside>
    <main className="dashboard-main"><div className="dashboard-toolbar"><span className="toolbar-kicker">ACCOUNT OVERVIEW</span></div><section className="state-card error-state" role="alert"><span className="state-icon error-icon"><FiAlertCircle /></span><p className="state-eyebrow">SOMETHING WENT WRONG</p><h1>We couldn’t load your dashboard</h1><p className="state-description">{message}</p><button className="action-button" onClick={onRetry}><FiRefreshCw /> Try again</button><p className="state-help">If the issue continues, check that the API is running and your Clerk keys are configured.</p></section></main>
  </div>
}

function DashboardContent({ role, data, onRefresh }: { role: PortalRole; data: DashboardData; onRefresh: () => void }) {
  const isAdmin = role === 'admin'
  const items = isAdmin ? data.recentActivity : data.updates
  const metrics: Metric[] = isAdmin
    ? [
      { label: 'Total investors', value: data.totalInvestors ?? 0, note: 'Accounts in this demo', icon: FiUsers, tone: 'blue' },
      { label: 'Active funds', value: data.activeFunds ?? 0, note: 'Funds in this demo', icon: FiBriefcase, tone: 'green' },
      { label: 'Pending reviews', value: data.pendingReviews ?? 0, note: 'Sample queue items', icon: FiClock, tone: 'amber', movement: 'down' },
    ]
    : [
      { label: 'Portfolio value', value: data.portfolioValue ?? '—', note: 'Sample portfolio value', icon: FiDollarSign, tone: 'green' },
      { label: 'Annual return', value: data.annualReturn ?? '—', note: 'Sample performance figure', icon: FiTrendingUp, tone: 'blue', movement: 'up' },
      { label: 'Active funds', value: data.activeFunds ?? 0, note: 'Funds in this demo', icon: FiBriefcase, tone: 'violet' },
    ]

  return <div className="dashboard-layout">
    <aside className="dashboard-sidebar">
      <div className="sidebar-label">WORKSPACE</div>
      <div className="sidebar-link is-active"><FiHome /> Overview</div>
      <div className="sidebar-role"><span className="role-avatar">{isAdmin ? <FiShield /> : <FiActivity />}</span><span><small>Signed in as</small><strong>{isAdmin ? 'Administrator' : 'Investor'}</strong></span></div>
      <div className="sidebar-security"><FiShield /><span><strong>Secure portal</strong><small>Your account is protected</small></span></div>
    </aside>

    <main className="dashboard-main">
      <div className="dashboard-toolbar"><div className="breadcrumb"><span>Workspace</span><FiArrowRight /><strong>Overview</strong></div><button className="action-button secondary-action" onClick={onRefresh}><FiRefreshCw /> Refresh</button></div>
      <div className="dashboard-title-block"><div><span className="dashboard-eyebrow">{isAdmin ? 'FUND OPERATIONS' : 'INVESTOR PORTAL'}</span><span className={`role-chip ${isAdmin ? 'role-chip-admin' : ''}`}>{isAdmin ? 'Admin' : 'Investor'}</span></div><h1>{isAdmin ? 'Operations overview' : 'Your portfolio at a glance'}</h1><p>{isAdmin ? 'A clear snapshot of fund activity and investor accounts.' : 'Your latest fund information, in one place.'}</p></div>

      <section className="metric-grid" aria-label={isAdmin ? 'Administration metrics' : 'Portfolio metrics'}>{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>

      <div className="dashboard-panels">
        <ActivityPanel isAdmin={isAdmin} items={items ?? []} />
        <aside className={`insight-card ${isAdmin ? 'admin-insight' : ''}`}>
          <span className="insight-icon">{isAdmin ? <FiFileText /> : <FiShield />}</span>
          <span className="dashboard-eyebrow">{isAdmin ? 'ADMIN WORKSPACE' : 'YOUR ACCOUNT'}</span>
          <h2>{isAdmin ? 'Review queue' : 'Private and secure'}</h2>
          {isAdmin ? <><p>{data.pendingReviews ?? 0} sample items are currently awaiting review.</p><div className="insight-footnote"><FiCheckCircle /> Counts shown are fictional demo content.</div></> : <><p>Your account gives you access to fund updates and portfolio information assigned to you.</p><div className="insight-footnote"><FiShield /> Your access is managed securely.</div></>}
        </aside>
      </div>
      <p className="demo-disclaimer">Demo portal · All portfolio values, returns, activity, and account totals shown here are fictional sample data.</p>
    </main>
  </div>
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  const TrendIcon = metric.movement === 'down' ? FiArrowDownRight : FiArrowUpRight
  return <article className="metric-card"><div className="metric-topline"><span className={`metric-icon metric-icon-${metric.tone}`}><Icon /></span>{metric.movement && <span className={`metric-trend ${metric.movement}`}><TrendIcon /> {metric.movement === 'up' ? 'Positive' : 'In queue'}</span>}</div><span className="metric-label">{metric.label}</span><strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span></article>
}

function ActivityPanel({ isAdmin, items }: { isAdmin: boolean; items: ActivityItem[] }) {
  const title = isAdmin ? 'Recent activity' : 'Recent fund updates'
  return <section className="activity-panel"><div className="panel-heading"><div><span className="dashboard-eyebrow">LATEST</span><h2>{title}</h2></div><span className="record-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
    {items.length === 0 ? <div className="empty-state"><span className="empty-icon"><FiInbox /></span><strong>{isAdmin ? 'No recent activity' : 'No fund updates yet'}</strong><p>{isAdmin ? 'New sample activity will appear here.' : 'We’ll show new fund updates here when they’re available.'}</p></div> : <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th scope="col">{isAdmin ? 'Activity' : 'Fund'}</th><th scope="col">Details</th><th scope="col">Updated</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.title}-${item.date}`}><td data-label={isAdmin ? 'Activity' : 'Fund'}><span className="table-title"><span className="table-row-icon">{isAdmin ? <FiUsers /> : <FiFileText />}</span>{item.title}</span></td><td className="table-detail" data-label="Details">{item.detail}</td><td className="table-date" data-label="Updated">{item.date}</td></tr>)}</tbody></table></div>}
  </section>
}

function App() {
  return <main className="page-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Fundly home"><span className="brand-mark"><FiTrendingUp aria-hidden="true" /></span><span>fundly</span></a><nav aria-label="Account actions"><Show when="signed-out"><SignInButton mode="modal"><button className="text-button">Log in</button></SignInButton><SignUpButton mode="modal"><button className="nav-button">Get started</button></SignUpButton></Show><Show when="signed-in"><UserButton /></Show></nav></header>
    <Show when="signed-out"><section className="hero-card"><div className="hero-copy"><span className="eyebrow">A CLEARER VIEW OF YOUR INVESTMENTS</span><h1>Your investments,<br /><span>all in one place.</span></h1><p>A private space for fund updates, portfolio documents, and the information that matters to you.</p><SignUpButton mode="modal"><button className="primary-button">Create your account <span aria-hidden="true">→</span></button></SignUpButton><div className="trust-note"><span className="lock-icon"><FiShield /></span> Private access for investors</div></div>
      <div className="visual-panel" aria-hidden="true"><div className="visual-topline"><span>PORTFOLIO OVERVIEW</span><span className="live-dot">● LIVE</span></div><div className="visual-balance-label">Total portfolio value</div><div className="visual-balance">$2,480,500</div><div className="visual-growth"><span>↗</span> 12.8% <small>this year</small></div><div className="chart-area"><div className="chart-grid"><i /><i /><i /><i /></div><svg viewBox="0 0 520 160" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#79a99c" stopOpacity=".25"/><stop offset="1" stopColor="#79a99c" stopOpacity="0"/></linearGradient></defs><path d="M0 137 C35 131 48 112 78 118 S123 130 155 100 S205 113 231 80 S281 89 311 70 S365 86 395 44 S449 58 478 30 S506 22 520 9 L520 160 L0 160Z" fill="url(#area)"/><path d="M0 137 C35 131 48 112 78 118 S123 130 155 100 S205 113 231 80 S281 89 311 70 S365 86 395 44 S449 58 478 30 S506 22 520 9" fill="none" stroke="#a5c7ba" strokeWidth="3"/></svg></div><div className="chart-dates"><span>JAN</span><span>MAR</span><span>MAY</span><span>JUL</span><span>SEP</span><span>NOW</span></div><div className="fund-row"><div className="fund-icon">N</div><div><strong>Northstar Growth Fund</strong><small>Updated today</small></div><span className="fund-return">+8.4%</span></div><div className="floating-note"><span className="note-icon">↗</span><span><strong>Quarterly update</strong><small>New report available</small></span><span className="note-dot"/></div></div>
    </section></Show>
    <Show when="signed-in"><PortalDashboard /></Show>
    <footer><span>© 2026 Fundly Investor Portal</span><span>Secure by design <i className="footer-dot">●</i></span></footer>
  </main>
}

export default App
