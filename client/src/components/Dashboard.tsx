import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import {
  FiActivity, FiAlertCircle, FiArrowDownRight, FiArrowRight, FiArrowUpRight, FiBriefcase,
  FiCheckCircle, FiClock, FiDollarSign, FiFileText, FiHome, FiInbox, FiRefreshCw,
  FiShield, FiTrendingUp, FiUsers,
} from 'react-icons/fi'
import '../dashboard.css'
import AdminApplicationReview from './AdminApplicationReview'
import InvestorApplicationStatus from './InvestorApplicationStatus'
import AdminProviderWorkflows from './AdminProviderWorkflows'
import AdminNavControl from './AdminNavControl'
import InvestorProviderWorkflow from './InvestorProviderWorkflow'
type PortalRole = 'investor' | 'admin'
type ActivityItem = { title: string; detail: string; date: string }
type DashboardData = {
  portfolioValue?: string
  activeFunds?: number
  valuationAsOf?: string | null
  valuations?: Array<{ id: number; fund_name: string; nav_per_unit: string; valuation_as_of: string; source: string; status: string; submitted_by: string; reviewed_by: string | null; review_note: string | null; reviewed_at: string | null; source_data: Record<string, unknown>; audit: Array<{ event: string; actor: string; at: string; details: Record<string, unknown> }> }>
  totalInvestors?: number
  pendingReviews?: number
  updates?: ActivityItem[]
  recentActivity?: ActivityItem[]
}
type Metric = { label: string; value: string | number; note: string; icon: typeof FiDollarSign; tone: string; movement?: 'up' | 'down' }

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export default function PortalDashboard() {
  const { getToken } = useAuth()
  const [role, setRole] = useState<PortalRole | null>(null)
  const [sellerRequest, setSellerRequest] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const loadDashboard = useCallback(async () => {
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }
      const profileResponse = await fetch(`${apiUrl}/api/me`, { headers })
      const profile: { role?: PortalRole; applicationIntent?: 'sell' | null; message?: string } = await profileResponse.json()
      if (!profileResponse.ok || (profile.role !== 'investor' && profile.role !== 'admin')) {
        throw new Error(profile.message ?? 'We could not confirm your account role.')
      }

      setSellerRequest(profile.role !== 'admin' && profile.applicationIntent === 'sell')
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

  useEffect(() => {
    const timer = window.setInterval(() => setReloadKey((key) => key + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  function refreshDashboard() {
    setError('')
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  if (loading) return <DashboardLoading />
  if (error || !role || !dashboard) {
    return <DashboardError message={error || 'Your dashboard is not available right now.'} onRetry={refreshDashboard} />
  }

  if (sellerRequest && role !== 'admin') return <SellerRequestNotice />

  return <DashboardContent role={role} data={dashboard} onRefresh={refreshDashboard} />
}

function SellerRequestNotice() {
  return <div className="dashboard-layout"><aside className="dashboard-sidebar"><div className="sidebar-label">WORKSPACE</div><div className="sidebar-link is-active"><FiBriefcase /> Seller interest</div><div className="sidebar-security"><FiShield /><span><strong>Secure portal</strong><small>Your account is protected</small></span></div></aside><main className="dashboard-main"><div className="dashboard-toolbar"><span className="toolbar-kicker">SELLER INTEREST</span></div><section className="state-card"><span className="state-icon"><FiBriefcase /></span><p className="state-eyebrow">ACCOUNT CREATED</p><h1>Your seller details are saved</h1><p className="state-description">Your signup recorded seller interest for this demo. Seller information does not create an administrator account or grant access to admin tools. Contact a portal administrator to request admin access.</p><p className="state-help">Role access is assigned by an administrator through trusted server-side Clerk settings.</p></section></main></div>
}

function DashboardLoading() {
  return <div className="dashboard-layout" role="status" aria-label="Loading dashboard">
    <aside className="dashboard-sidebar"><div className="sidebar-label">WORKSPACE</div><div className="sidebar-link is-active"><FiHome /> Overview</div><div className="sidebar-security"><FiShield /><span><strong>Secure portal</strong><small>Your account is protected</small></span></div></aside>
    <main className="dashboard-main"><div className="dashboard-toolbar"><span className="toolbar-kicker">ACCOUNT OVERVIEW</span><span className="loading-pill">Loadingâ€¦</span></div><div className="dashboard-title-block"><div className="skeleton skeleton-kicker"/><div className="skeleton skeleton-title"/><div className="skeleton skeleton-description"/></div><div className="metric-grid">{[1, 2, 3].map((item) => <div className="metric-card skeleton-card" key={item}><div className="skeleton skeleton-kicker"/><div className="skeleton skeleton-value"/><div className="skeleton skeleton-description"/></div>)}</div><div className="skeleton skeleton-table"/></main>
  </div>
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="dashboard-layout">
    <aside className="dashboard-sidebar"><div className="sidebar-label">WORKSPACE</div><div className="sidebar-link is-active"><FiHome /> Overview</div><div className="sidebar-security"><FiShield /><span><strong>Secure portal</strong><small>Your account is protected</small></span></div></aside>
    <main className="dashboard-main"><div className="dashboard-toolbar"><span className="toolbar-kicker">ACCOUNT OVERVIEW</span></div><section className="state-card error-state" role="alert"><span className="state-icon error-icon"><FiAlertCircle /></span><p className="state-eyebrow">SOMETHING WENT WRONG</p><h1>We couldnâ€™t load your dashboard</h1><p className="state-description">{message}</p><button className="action-button" onClick={onRetry}><FiRefreshCw /> Try again</button><p className="state-help">If the issue continues, check that the API is running and your Clerk keys are configured.</p></section></main>
  </div>
}

function DashboardContent({ role, data, onRefresh }: { role: PortalRole; data: DashboardData; onRefresh: () => void }) {
  const isAdmin = role === 'admin'
  const items = isAdmin ? data.recentActivity : data.updates
  const metrics: Metric[] = isAdmin
    ? [
      { label: 'Total investors', value: data.totalInvestors ?? 0, note: 'Investor records', icon: FiUsers, tone: 'blue' },
      { label: 'Active funds', value: data.activeFunds ?? 0, note: 'Funds with positions', icon: FiBriefcase, tone: 'green' },
      { label: 'Pending reviews', value: data.pendingReviews ?? 0, note: 'Applications to review', icon: FiClock, tone: 'amber', movement: 'down' },
    ]
    : [
      { label: 'Portfolio value', value: data.portfolioValue ?? '$0.00', note: 'Based on approved NAVs', icon: FiDollarSign, tone: 'green' },
      { label: 'NAV updated', value: data.valuationAsOf ? new Date(data.valuationAsOf).toLocaleDateString() : 'Pending', note: 'Latest approved valuation', icon: FiTrendingUp, tone: 'blue' },
      { label: 'Invested funds', value: data.activeFunds ?? 0, note: 'Assigned to your account', icon: FiBriefcase, tone: 'violet' },
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

      {!isAdmin && <NavAuditHistory valuations={data.valuations ?? []} />}

      {isAdmin ? <><AdminApplicationReview /><AdminProviderWorkflows /><AdminNavControl /></> : <><InvestorApplicationStatus /><InvestorProviderWorkflow /></>}

      <div className="dashboard-panels">
        <ActivityPanel isAdmin={isAdmin} items={items ?? []} />
        <aside className={`insight-card ${isAdmin ? 'admin-insight' : ''}`}>
          <span className="insight-icon">{isAdmin ? <FiFileText /> : <FiShield />}</span>
          <span className="dashboard-eyebrow">{isAdmin ? 'ADMIN WORKSPACE' : 'YOUR ACCOUNT'}</span>
          <h2>{isAdmin ? 'Review queue' : 'Private and secure'}</h2>
          {isAdmin ? <><p>{data.pendingReviews ?? 0} investor applications are currently awaiting review.</p><div className="insight-footnote"><FiCheckCircle /> Counts reflect database records.</div></> : <><p>Your account gives you access to fund updates and portfolio information assigned to you.</p><div className="insight-footnote"><FiShield /> Your access is managed securely.</div></>}
        </aside>
      </div>
      <p className="demo-disclaimer">Portfolio values use assigned fund units and the latest approved NAV. NAVs remain estimates until reviewed under your fund’s valuation policy.</p>
    </main>
  </div>
}

function NavAuditHistory({ valuations }: { valuations: NonNullable<DashboardData['valuations']> }) {
  return <section className="activity-panel nav-audit-panel"><div className="panel-heading"><div><span className="dashboard-eyebrow">VALUATION RECORD</span><h2>NAV history and audit trail</h2></div><span className="record-count">{valuations.length} records</span></div>
    {!valuations.length ? <div className="empty-state"><strong>No valuation history yet</strong><p>Approved fund NAV updates will appear here with their source and review record.</p></div> : <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Fund / as of</th><th>NAV / source</th><th>Status / reviewer</th><th>Audit</th></tr></thead><tbody>{valuations.map((item) => <tr key={item.id}><td><span className="table-title">{item.fund_name}</span><span className="nav-subline">{new Date(item.valuation_as_of).toLocaleString()}</span></td><td>{Number(item.nav_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}<span className="nav-subline">{item.source}</span></td><td><span className={`nav-status ${item.status}`}>{item.status}</span><span className="nav-subline">{item.reviewed_by ? `Reviewed by ${item.reviewed_by}` : `Submitted by ${item.submitted_by}`}</span>{item.review_note && <span className="nav-subline">{item.review_note}</span>}</td><td><details><summary>{item.audit.length} events</summary><ul>{item.audit.map((event, index) => <li key={`${item.id}-${index}`}>{event.event} · {new Date(event.at).toLocaleString()} · {event.actor}</li>)}</ul><pre>{JSON.stringify(item.source_data, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
  </section>
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  const TrendIcon = metric.movement === 'down' ? FiArrowDownRight : FiArrowUpRight
  return <article className="metric-card"><div className="metric-topline"><span className={`metric-icon metric-icon-${metric.tone}`}><Icon /></span>{metric.movement && <span className={`metric-trend ${metric.movement}`}><TrendIcon /> {metric.movement === 'up' ? 'Positive' : 'In queue'}</span>}</div><span className="metric-label">{metric.label}</span><strong className="metric-value">{metric.value}</strong><span className="metric-note">{metric.note}</span></article>
}

function ActivityPanel({ isAdmin, items }: { isAdmin: boolean; items: ActivityItem[] }) {
  const title = isAdmin ? 'Recent activity' : 'Recent fund updates'
  return <section className="activity-panel"><div className="panel-heading"><div><span className="dashboard-eyebrow">LATEST</span><h2>{title}</h2></div><span className="record-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
    {items.length === 0 ? <div className="empty-state"><span className="empty-icon"><FiInbox /></span><strong>{isAdmin ? 'No recent activity' : 'No fund updates yet'}</strong><p>{isAdmin ? 'New sample activity will appear here.' : 'Weâ€™ll show new fund updates here when theyâ€™re available.'}</p></div> : <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th scope="col">{isAdmin ? 'Activity' : 'Fund'}</th><th scope="col">Details</th><th scope="col">Updated</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.title}-${item.date}`}><td data-label={isAdmin ? 'Activity' : 'Fund'}><span className="table-title"><span className="table-row-icon">{isAdmin ? <FiUsers /> : <FiFileText />}</span>{item.title}</span></td><td className="table-detail" data-label="Details">{item.detail}</td><td className="table-date" data-label="Updated">{item.date}</td></tr>)}</tbody></table></div>}
  </section>
}




