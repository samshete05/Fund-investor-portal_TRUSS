# Fund Investor Portal

React + Vite + TypeScript client with Tailwind CSS and an Express JavaScript API. Clerk handles sign-in on the client and verifies protected API requests.

## Requirements

- Node.js 20.9 or newer (required by the current Clerk SDK; Vite 6 also supports older Node versions)
- npm
- A Clerk application with its publishable and secret keys

## Setup

1. Add your Clerk publishable key in `client/.env` and the matching publishable and secret keys in `server/.env`.
3. In `client/`, run `npm install` then `npm run dev`.
4. In `server/`, run `npm install` then `npm run dev`.

The client starts at `http://localhost:5173` and API at `http://localhost:3000`. The API provides separate `/api/investor/dashboard` and `/api/admin/dashboard` endpoints. It reads each role from the Clerk user's **private metadata**, defaults missing roles to investor, and enforces the role again on the server for every dashboard request. Dashboard metrics are sample data until connected to your fund database.

## Assigning roles in Clerk

In the Clerk Dashboard, open **Users**, select the user, and edit **Private metadata**:

```json
{ "role": "investor" }
```

For an administrator, set `{ "role": "admin" }`. Do not put role selection in the React app or in unsafe metadata. Only trusted administrators should change private metadata.

Never put `CLERK_SECRET_KEY` in the client environment. `VITE_` variables are bundled into browser code. The local `.env` files are ignored by Git.
