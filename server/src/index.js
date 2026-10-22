import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { clerkClient, clerkMiddleware, getAuth, requireAuth } from '@clerk/express'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(cors({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173' }))
app.use(express.json())

const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY?.trim())

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'fund-investor-portal-api',
    authentication: clerkConfigured ? 'configured' : 'needs_configuration',
    message: clerkConfigured ? 'API is ready.' : 'Add CLERK_SECRET_KEY to server/.env to enable authenticated endpoints.',
  })
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fund-investor-portal-api', authentication: clerkConfigured ? 'configured' : 'needs_configuration' })
})

if (clerkConfigured) {
  app.use(clerkMiddleware())
} else {
  console.warn('CLERK_SECRET_KEY is missing. Public health routes are available; authenticated routes will return 503.')
}

function requireClerkConfiguration(_req, res, next) {
  if (!clerkConfigured) {
    return res.status(503).json({ message: 'Clerk is not configured on the server. Add CLERK_SECRET_KEY to server/.env and restart the API.' })
  }
  next()
}

async function loadClerkUser(req, res, next) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ message: 'Authentication required.' })
    req.clerkUser = await clerkClient.users.getUser(userId)
    req.portalRole = req.clerkUser.privateMetadata?.role === 'admin' ? 'admin' : 'investor'
    next()
  } catch (error) {
    next(error)
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.portalRole !== role) {
      return res.status(403).json({ message: `The ${role} dashboard is not available to this account.` })
    }
    next()
  }
}

app.get('/api/me', requireClerkConfiguration, requireAuth(), loadClerkUser, (req, res) => {
  res.json({ userId: req.clerkUser.id, role: req.portalRole })
})

app.get('/api/investor/dashboard', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('investor'), (_req, res) => {
  res.json({
    portfolioValue: '$2,480,500',
    annualReturn: '+12.8%',
    activeFunds: 3,
    updates: [
      { title: 'Northstar Growth Fund', detail: 'Quarterly update available', date: 'Today' },
      { title: 'Fund documents', detail: 'Your latest statements are ready', date: 'Oct 18' },
    ],
  })
})

app.get('/api/admin/dashboard', requireClerkConfiguration, requireAuth(), loadClerkUser, requireRole('admin'), (_req, res) => {
  res.json({
    totalInvestors: 128,
    activeFunds: 6,
    pendingReviews: 4,
    recentActivity: [
      { title: 'Investor onboarding', detail: 'New investor account requires review', date: 'Today' },
      { title: 'Quarterly reporting', detail: 'Two fund updates are ready to publish', date: 'Yesterday' },
    ],
  })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'An unexpected server error occurred.' })
})

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`)
})
