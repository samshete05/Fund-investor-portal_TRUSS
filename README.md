# Fund Investor Portal

React + Vite + TypeScript client with Tailwind CSS and an Express JavaScript API. Clerk handles sign-in on the client and verifies protected API requests.

## Requirements

- Node.js 20.9 or newer (required by the current Clerk SDK; Vite 6 also supports older Node versions)
- npm
- A Clerk application with its publishable and secret keys

## Setup

1. Add your Clerk publishable key in `client/.env` and the matching publishable and secret keys in `server/.env`.
2. Add a PostgreSQL connection string as `DATABASE_URL` in `server/.env` (see `server/.env.example`).
3. In `server/`, run `npm install`, then `npm run db:migrate` to create the onboarding tables, provider workflow tables, and database functions. `DATABASE_URL` must point to your PostgreSQL database first.
4. In `client/`, run `npm install` then `npm run dev`.
5. In `server/`, run `npm run dev`.

The client starts at `http://localhost:5173` and API at `http://localhost:3000`. The API provides separate `/api/investor/dashboard` and `/api/admin/dashboard` endpoints. It reads each role from the Clerk user's **private metadata**, defaults missing roles to investor, and enforces the role again on the server for every protected request. Dashboard metrics are sample data until connected to your fund database.

Investor signup submits a pending application to PostgreSQL. Investors can view their status at `GET /api/investor/application`. Admins assigned through Clerk private metadata can view the review queue at `GET /api/admin/applications` and set a pending application to approved or rejected with `PATCH /api/admin/applications/:id/review`. Rejections require an admin note; every review decision is recorded in `investor_application_reviews`. Applicant financial and accreditation answers are self-reported and are not verified or used for automatic eligibility decisions. This workflow does not process investments, securities transactions, or payments.

## PostgreSQL setup

Set `DATABASE_URL` in `server/.env` to a PostgreSQL connection string, for example `postgresql://postgres:your_password@localhost:5432/fund_portal`. In `server/`, run `npm run db:migrate`. The command applies the SQL migrations in order. You can also run `server/sql/pgadmin_setup.sql` in pgAdmin against the same database. The app's PostgreSQL user must have permission to use the `portal` schema and its functions.

## Fictional test records

After applying migrations, add `DEMO_INVESTOR_CLERK_USER_ID` to `server/.env` with the Clerk user ID of your test investor. Temporarily add `SEED_DEMO_DATA=true` to that file, then run `npm run db:seed-demo` from `server/`. Remove `SEED_DEMO_DATA` after seeding. The seed command refuses to run when `NODE_ENV=production`. It creates four fictional investor applications with pending, approved, and rejected states; four provider workflow examples; and four fictional funds with NAV values assigned to the selected test investor. Names and email addresses use the reserved `.test` domain. Re-running the command does not duplicate the seed records.

Investor application data, review decisions, and notes are stored in PostgreSQL. Accreditation, financial, experience, and risk answers are self-reported; the portal does not perform KYC/AML checks or process investments or payments.

## Provider onboarding (sandbox by default)

The portal delegates institutional identity/compliance verification to Persona and electronic signature to DocuSign. The server creates provider cases and envelopes; provider-signed webhooks update the workflow. The portal stores provider case/envelope IDs, statuses, next actions, agreement version, timestamps, and audit events. It does not store identity documents or webhook payloads. Investor and admin status fields are read-only; only verified provider events can advance them. Server checks require the investor application to be approved before starting provider verification, and require provider approval before sending the agreement.

Set the provider variables in `server/.env` using `server/.env.example`. `INTEGRATION_MODE` defaults to `sandbox`. Sandbox mode uses only `PERSONA_SANDBOX_*` credentials and requires a DocuSign demo account (`https://account-d.docusign.com`) and sandbox template. The UI labels this as sandbox and says it is not real verification or a production signature. Production mode requires separate Persona production credentials plus the production DocuSign OAuth host (`https://account.docusign.com`). Do not expose provider credentials to the client. Configure the provider webhook destinations to `POST /api/webhooks/persona` and `POST /api/webhooks/docusign`, with each provider's signing secret/HMAC key in the server environment. Webhook retries are deduplicated by provider event ID.

Persona needs an organization-configured inquiry template and environment. DocuSign needs an organization-approved template, role name, and agreement version. This integration sends the configured template; it does not create legal agreement terms. Before production, the organization’s legal and compliance teams must approve provider choice, provider workflows, data retention, webhook configuration, and agreement language. Confirm provider account permissions, consent, template content, environment routing, and retention policy with those teams. No accreditation, identity, sanctions, or compliance decisions are implemented by this portal.

Run provider security and state tests from `server/` with `npm test`. Apply all database migrations with `npm run db:migrate` after setting `DATABASE_URL`.

## Assigning roles in Clerk

In the Clerk Dashboard, open **Users**, select the user, and edit **Private metadata**:

```json
{ "role": "investor" }
```

For an administrator, set `{ "role": "admin" }`. Do not put role selection in the React app or in unsafe metadata. Only trusted administrators should change private metadata.

Never put `CLERK_SECRET_KEY` in the client environment. `VITE_` variables are bundled into browser code. The local `.env` files are ignored by Git.
