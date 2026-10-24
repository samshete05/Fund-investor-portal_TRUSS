# Fund Investor Portal

Fund Investor Portal is a full-stack investor onboarding and portfolio visibility application. It gives investors a secure place to submit an investor application, track review and onboarding progress, view assigned fund positions and approved NAV valuations, and complete provider-based verification and electronic signing. Administrators can review applications, manage onboarding workflows, assign fund positions, and submit or review NAV valuations.

This repository contains a working sandbox/demo workflow. It does **not** make accreditation, KYC/AML, identity, sanctions, investment, securities, or payment decisions. Investor financial and accreditation information is self-reported, provider integrations are environment-dependent, and demo records are fictional.

## Key features

### Investor experience

- Clerk sign-up and sign-in.
- Server-authoritative investor/admin role detection.
- Investor application form with contact, investment profile, accreditation, experience, risk, and privacy-notice fields.
- Application status tracking: pending, approved, or rejected.
- Re-application after a rejected application.
- Provider onboarding status and audit history.
- Persona KYC/identity verification launch and continuation links.
- DocuSign agreement workflow after provider verification is approved.
- Portfolio dashboard showing assigned funds, units, approved NAV per unit, market value, and valuation history.
- Seller-interest capture that does not grant administrative access.

### Administrator experience

- Admin dashboard with investor, fund, and pending-review metrics.
- Investor application review queue.
- Approve or reject applications, with a required note for rejections.
- Provider workflow monitoring and administrative audit notes.
- NAV valuation submission and review.
- Approve or reject pending valuations, with a required note for rejections.
- Assign or update an investor's fund position and unit balance.
- Audit trails for application reviews, provider workflow events, NAV valuations, and position changes.

### Reliability and security controls

- Clerk private metadata is the source of truth for authorization.
- Every protected route checks authentication, role, and database availability.
- Server-side validation for application, review, NAV, and position inputs.
- Persona and DocuSign webhook signature validation.
- Webhook retry deduplication by provider event ID.
- Provider state-transition validation to prevent invalid or frontend-forged workflow jumps.
- PostgreSQL transactions and locks for review, onboarding, and NAV operations.
- Sandbox/production integration separation.
- Provider credentials remain server-side and are never exposed to the client.

## Technology stack

### Frontend

- React 19
- TypeScript 6
- Vite 6
- Tailwind CSS 3
- React Icons
- Clerk React SDK
- ESLint

### Backend

- Node.js 20.9+
- Express 5
- JavaScript using native ES modules
- Clerk Express middleware
- `pg` PostgreSQL client
- CORS
- Dotenv
- Nodemon for development

### Data and integrations

- PostgreSQL
- SQL migrations and PostgreSQL functions
- Persona for KYC/identity workflow integration
- DocuSign for electronic signing workflow integration
- HMAC/signature verification for provider webhooks

## Architecture

```text
                           +----------------------+
                           |       Clerk          |
                           | Authentication/Roles |
                           +----------+-----------+
                                      |
                                      v
+------------------+       +---------+----------+       +------------------+
| React + Vite     | HTTPS | Express API        | SQL   | PostgreSQL       |
| TypeScript UI    +------>+ Auth, validation,   +------>+ Applications     |
| Investor/Admin   |       | workflows, NAV     |       | Workflows, NAV   |
+------------------+       +----+-----------+----+       | Audit records    |
                               |           |             +------------------+
                               |           |
                         +-----v----+ +----v-----+
                         | Persona  | | DocuSign |
                         | KYC      | | e-sign   |
                         +----------+ +----------+
```

The browser calls the Express API with a Clerk bearer token. The API resolves the Clerk user, reads the trusted private metadata role, validates the request, and performs database operations. Provider webhooks enter through public webhook routes, are signature-checked, deduplicated, and applied only when the provider event represents a valid state transition.

The frontend uses a single Vite application and renders either the public landing page or the authenticated investor/admin dashboard. The backend keeps database access in `server/src/db.js`, route and middleware composition in `server/src/index.js`, and external provider concerns in `server/src/integrations/`.

## Project structure

```text
fund-investor-portal/
├── README.md
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig*.json
│   ├── public/
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── App.css
│       ├── index.css
│       ├── dashboard.css
│       ├── assets/
│       └── components/
│           ├── AuthModal.tsx
│           ├── Dashboard.tsx
│           ├── InvestorApplicationStatus.tsx
│           ├── InvestorProviderWorkflow.tsx
│           ├── AdminApplicationReview.tsx
│           ├── AdminProviderWorkflows.tsx
│           ├── AdminNavControl.tsx
│           ├── HomeGuide.tsx
│           ├── PlatformStats.tsx
│           ├── SiteHeader.tsx
│           └── SiteFooter.tsx
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── migrations/
│   │   ├── 001_investor_applications.sql
│   │   ├── 002_investor_workflow_functions.sql
│   │   ├── 003_provider_workflows.sql
│   │   └── 004_nav_valuation.sql
│   ├── scripts/
│   │   ├── migrate.js
│   │   └── seed-demo-data.js
│   ├── sql/
│   │   └── pgadmin_setup.sql
│   ├── src/
│   │   ├── db.js
│   │   ├── index.js
│   │   └── integrations/
│   │       ├── config.js
│   │       ├── docusign.js
│   │       ├── persona.js
│   │       └── security.js
│   └── test/
│       └── integrations.test.js
└── .gitignore
```

## Requirements

- Node.js 20.9 or newer.
- npm.
- PostgreSQL 14+ recommended.
- A Clerk application with a publishable key and server secret key.
- Persona and DocuSign sandbox credentials for provider workflow testing.

## Local setup

### 1. Configure Clerk

Create a Clerk application and add:

- `VITE_CLERK_PUBLISHABLE_KEY` to `client/.env`.
- `CLERK_SECRET_KEY` to `server/.env`.

Set the user's role in Clerk **Private metadata**:

```json
{ "role": "investor" }
```

or:

```json
{ "role": "admin" }
```

Roles must not be selected by the client. The API treats every non-`admin` role as `investor`.

### 2. Install dependencies

```powershell
cd client
npm install

cd ..\server
npm install
```

### 3. Configure the server

Copy `server/.env.example` to `server/.env` and set at least:

```dotenv
PORT=3000
CLIENT_URL=http://localhost:5173
CLERK_SECRET_KEY=sk_test_your_key
DATABASE_URL=postgresql://postgres:password@localhost:5432/fund_portal
DATABASE_SSL=false
INTEGRATION_MODE=sandbox
```

For provider workflows, also configure the Persona and DocuSign sandbox values in `server/.env`. Use the exact provider webhook secrets and approved sandbox templates supplied by those providers.

### 4. Create and migrate the database

Create an empty PostgreSQL database named `fund_portal`, then run:

```powershell
cd server
npm run db:migrate
```

The migration runner applies, in order:

1. Investor application tables and review history.
2. PostgreSQL functions used by the application workflow.
3. Provider onboarding workflow, webhook, and audit tables.
4. Fund positions, NAV valuation, and NAV audit tables.

The same SQL can be run from `server/sql/pgadmin_setup.sql` in pgAdmin when a GUI setup is preferred. The database user must be able to create/use the required tables, indexes, functions, and schema objects.

### 5. Start the application

Run the API in one terminal:

```powershell
cd server
npm run dev
```

Run the client in another terminal:

```powershell
cd client
npm run dev
```

Open <http://localhost:5173>. The API listens on <http://localhost:3000>.

For a production-style local start:

```powershell
cd client
npm run build

cd ..\server
npm start
```

Set `VITE_API_URL` in `client/.env` when the API is not running at `http://localhost:3000`.

## Database setup and demo data

### Main tables

- `investor_applications`: investor profile, application status, and review information.
- `investor_application_reviews`: immutable application review history.
- `investor_provider_workflows`: Persona and DocuSign identifiers, statuses, environments, timestamps, and next actions.
- `provider_webhook_events`: provider event IDs used for webhook deduplication.
- `investor_workflow_audit`: provider and administrator workflow audit events.
- `fund_positions`: fund/unit balances assigned to Clerk users.
- `fund_position_audit`: position change history.
- `fund_nav_valuations`: submitted, approved, or rejected NAV valuations.
- `fund_nav_audit`: NAV submission and review history.

### Seed fictional records

After migrations, set the Clerk ID of a test investor and temporarily enable seeding:

```dotenv
DEMO_INVESTOR_CLERK_USER_ID=user_test_investor_id
SEED_DEMO_DATA=true
```

Then run:

```powershell
cd server
npm run db:seed-demo
```

The seed script creates or refreshes fictional application, provider workflow, fund position, and approved NAV records. It is disabled when `NODE_ENV=production`, requires explicit `SEED_DEMO_DATA=true`, and uses reserved `.test` email addresses. Remove `SEED_DEMO_DATA` after seeding.

## Backend API endpoints

Protected routes require a Clerk bearer token:

```http
Authorization: Bearer <clerk-session-token>
```

### Public endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | API status and Clerk configuration status |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/webhooks/persona` | Receive signed Persona workflow events |
| `POST` | `/api/webhooks/docusign` | Receive signed DocuSign Connect events |

Webhook routes do not use Clerk authentication. They require valid provider signatures and configured database access.

### Shared authenticated endpoints

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/api/me` | Investor/Admin | Return the authenticated user ID, resolved role, and display-only application intent |

### Investor endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/investor/application` | Submit a new application or resubmit a rejected application |
| `GET` | `/api/investor/application` | Get the current investor application |
| `GET` | `/api/investor/workflow` | Get provider onboarding status and audit history |
| `POST` | `/api/investor/workflow/kyc/start` | Create or continue a Persona verification case |
| `POST` | `/api/investor/workflow/agreement/send` | Create a DocuSign envelope after KYC approval |
| `GET` | `/api/investor/dashboard` | Get portfolio summary and approved NAV-based updates |
| `GET` | `/api/investor/nav` | Get positions and NAV valuation history |

### Administrator endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Get investor, fund, pending-review, and recent-activity metrics |
| `GET` | `/api/admin/applications` | List investor applications |
| `PATCH` | `/api/admin/applications/:id/review` | Approve or reject a pending application |
| `GET` | `/api/admin/workflows` | List provider onboarding workflows |
| `POST` | `/api/admin/workflows/:applicationId/notes` | Add an audit note to a workflow |
| `GET` | `/api/admin/nav/valuations` | List pending NAV valuations |
| `POST` | `/api/admin/nav/valuations` | Submit a NAV valuation |
| `PATCH` | `/api/admin/nav/valuations/:id/review` | Approve or reject a pending NAV valuation |
| `PUT` | `/api/admin/nav/positions` | Assign or update an investor's fund units |

### Important request rules

- Applications require a verified primary Clerk email, required contact fields, accepted privacy notice, and valid enumerated investor answers.
- Rejected applications require a non-empty admin note when reviewed.
- A KYC workflow can start only after the investor application is approved.
- An agreement can be sent only after KYC is approved and the investor has a verified primary email.
- NAV per unit and position units must be positive finite numbers.
- NAV valuation dates must be valid and not in the future.
- Rejected NAV valuations require a review note.
- Provider webhook events must pass signature verification and valid state-transition checks.

## Testing and quality checks

### Current test setup

The server uses the built-in Node.js test runner and currently covers the security-critical integration logic:

- Admin role recognition.
- Persona HMAC signature validation, timestamps, and rotated signatures.
- DocuSign base64 HMAC signature validation and rotated signature headers.
- Webhook event deduplication.
- KYC and agreement state-transition rules.

Run the existing tests with:

```powershell
cd server
npm test
```

Run the client checks with:

```powershell
cd client
npm run lint
npm run build
```

### Recommended testing strategy

The best fit for this application is a layered test strategy:

1. **Unit tests** with Node's `node:test` for server validation, authorization, signature verification, state transitions, and database helper behavior.
2. **API integration tests** using a disposable PostgreSQL database to verify migrations, SQL functions, role enforcement, application review, NAV review, workflow locking, and webhook processing.
3. **React component tests** using Vitest and React Testing Library for loading/error states, role-specific dashboards, forms, validation messages, and refresh behavior.
4. **End-to-end tests** using Playwright for the critical investor and admin journeys:
   - Sign in and resolve a role.
   - Submit an investor application.
   - Review the application as an admin.
   - Start provider onboarding.
   - Submit, approve, and display a NAV valuation.
   - Display an investor's portfolio value.
5. **Contract tests** for Persona and DocuSign webhook payload parsing and signature headers using recorded, non-sensitive fixtures.
6. **Static checks** on every change with TypeScript build, ESLint, and the server test suite.

Provider calls should be mocked in automated tests. Real Persona, DocuSign, and Clerk sandbox smoke tests should run separately because they require external credentials and provider state.

## Provider integration and production notes

The default `INTEGRATION_MODE=sandbox` setting uses Persona sandbox credentials and a DocuSign demo account. Configure webhook destinations as:

```text
POST /api/webhooks/persona
POST /api/webhooks/docusign
```

Before production use, the organization must approve provider choice, templates, agreement language, consent, data retention, webhook configuration, account permissions, and compliance responsibilities. Use separate production credentials and the production DocuSign OAuth host. Never expose `CLERK_SECRET_KEY`, provider API keys, private signing keys, or webhook secrets in the client or source control.

## Available scripts

### Client

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production client build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production client build |

### Server

| Command | Description |
|---|---|
| `npm run dev` | Start the API with Nodemon |
| `npm start` | Start the API with Node |
| `npm run db:migrate` | Apply all PostgreSQL migrations |
| `npm run db:seed-demo` | Seed fictional non-production records |
| `npm test` | Run Node integration/security tests |

## Scope and limitations

- This is an onboarding and portfolio-information portal, not an investment execution platform.
- It does not process investments, securities transactions, money movement, or payments.
- It does not independently verify accreditation, identity, sanctions, financial information, or compliance eligibility.
- The dashboard displays only positions and NAV valuations stored in the application database.
- NAV data is operational input and requires an administrator review before it appears as an approved investor valuation.
