# FLOW

FLOW is a nationwide membership, opportunity, and identity platform. This repo contains the web app: a Next.js frontend backed by Supabase (Postgres + Auth).

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS** for styling
- **Supabase** for auth, database, and row-level security
- **@supabase/ssr** for cookie-based server/browser auth

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + publishable key
npm run dev
```

App runs at `http://localhost:3000`.

## What's real vs. demo data

- **Real, Supabase-backed:** sign up / log in / sessions, your own profile, skills, Passport visibility and achievements, business profile creation, posting/managing opportunities and events as a business (including ticket check-in), the full opportunity and event lifecycles (apply/accept/complete, register/cancel/no-show), FLOW Points redemption, notifications, and Discover (real members with a public passport + real businesses).
- **Demo/mock data** (`lib/mock/data.ts`): supplements the above so browse screens never look empty before the platform has enough real multi-city content — extra opportunities, events, and rewards-catalog entries are blended in alongside real rows. Connections and Messages are still fully mock/stubbed; Messages says so in the UI. These mirror the real database schema field-for-field so they can be swapped out entirely as real content grows. See `lib/mock/passport-adapter.ts` for how demo profiles resolve on `/p/[username]`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit

## Database

Schema, RLS policies, and the `passport_summary` view live in the Supabase project (`flow-platform`). Key tables: `profiles`, `skills`, `profile_skills`, `organizations`, `opportunities`, `applications`, `events`, `event_attendance`, `recommendations`, `verifications`, `flow_ledger`.
