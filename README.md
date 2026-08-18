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

- **Real, Supabase-backed:** sign up / log in / sessions, your own profile, skills, Passport visibility, business profile creation, and posting/managing opportunities as a business.
- **Demo/mock data** (`lib/mock/data.ts`): the browse/discovery experience — other members, businesses, the live opportunity map, events, tickets, rewards catalog, notifications, and the activity feed. These mirror the real database schema field-for-field so they can be swapped for live queries once the platform has real multi-user content. See `lib/mock/passport-adapter.ts` for how demo profiles resolve on `/p/[username]`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit

## Database

Schema, RLS policies, and the `passport_summary` view live in the Supabase project (`flow-platform`). Key tables: `profiles`, `skills`, `profile_skills`, `organizations`, `opportunities`, `applications`, `events`, `event_attendance`, `recommendations`, `verifications`, `flow_ledger`.
