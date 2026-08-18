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

- **Real, Supabase-backed:** sign up / log in / sessions, your own profile, skills, Passport visibility and achievements, business profile creation, posting/managing opportunities and events as a business (including ticket check-in), the full opportunity and event lifecycles (apply/accept/complete, register/cancel/no-show), FLOW Points redemption, notifications, Discover (real members with a public passport + real businesses), Connections — send/accept/decline/cancel/remove requests, block/unblock, and report — and Messages: real-time direct messages between connections, event group chats, and opportunity applicant↔employer chats (see "Connections & blocking" and "Messages" below).
- **Demo/mock data** (`lib/mock/data.ts`): supplements the above so browse screens never look empty before the platform has enough real multi-city content — extra opportunities, events, rewards-catalog entries, and Discover profiles/businesses are blended in alongside real rows. Mock rows mirror the real database schema field-for-field so they can be phased out as real content grows. See `lib/mock/passport-adapter.ts` for how demo profiles resolve on `/p/[username]`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit

## Database

Schema, RLS policies, and the `passport_summary` view live in the Supabase project (`flow-platform`). Key tables: `profiles`, `skills`, `profile_skills`, `organizations`, `opportunities`, `applications`, `events`, `event_attendance`, `recommendations`, `verifications`, `flow_ledger`, `rewards`, `reward_redemptions`, `achievements`, `profile_achievements`, `connections`, `connection_events`, `connection_reports`, `admins`, `conversations`, `conversation_members`, `messages`.

### Connections & blocking

`connections` holds one canonical row per unordered pair of profiles (a unique index on `least`/`greatest` of the two ids enforces this) with a live `status` of `pending`, `accepted`, or `blocked`. Every mutation goes through a `SECURITY DEFINER` RPC — the client has no direct INSERT/UPDATE/DELETE grant on the table at all:

- `send_connection_request(p_recipient_id)` — creates a pending request, or **auto-accepts** if the other party already sent one (a crossed/simultaneous request resolves deterministically instead of leaving two dangling rows). Concurrent callers for the same pair are serialized with `pg_advisory_xact_lock` before touching any row, so this is race-safe even under real concurrency, not just app-level duplicate checks.
- `respond_to_connection_request(p_connection_id, 'accept' | 'decline')`, `cancel_connection_request`, `remove_connection` — decline/cancel/remove all delete the live row (a fresh request can be sent afterward) but first log the transition to `connection_events`, an append-only audit table with no client write access, so history survives even though the live row doesn't.
- `block_profile` / `unblock_profile` — either party can block from any prior state; only the blocker can unblock. A `RESTRICTIVE` policy on `profiles` (`profiles_block_restrict`, via the `is_blocked_between()` helper) makes each party's profile invisible to the other at the database level — Discover, Suggested, and `/p/[username]` all stop surfacing a blocked pair automatically, without per-query filtering. The one deliberate exception is `get_my_blocked_profiles()`, a narrow RPC that lets the blocker see who they've blocked (name/avatar only) so the "Blocked" tab can actually render and offer Unblock.
- `report_profile` — writes to `connection_reports`, readable only by the reporter and anyone listed in `admins` (a table nobody can write to through the API — admins are provisioned by running SQL directly against the project).

All of these RPCs have `EXECUTE` revoked from `anon` *and* `PUBLIC` — only signed-in users can call them. (Worth flagging: revoking from `anon` alone turned out to be a no-op the first time, because Postgres grants `EXECUTE` to `PUBLIC` by default at function-creation time and `anon` inherits through that, not a direct grant. `has_function_privilege('anon', ...)` still returned `true` after an `anon`-only revoke; fixed by also revoking from `PUBLIC`. `is_blocked_between()` is the one deliberate exception — it stays `PUBLIC`-executable since the `profiles_block_restrict` policy needs to call it for anonymous, logged-out profile views too.)

### Messages

`conversations` (`direct` / `event` / `opportunity`) + `conversation_members` (per-member `last_read_at`, no separate reads table) + `messages` (soft-deleted via `deleted_at`, never hard-deleted). As with Connections, there is no client INSERT/UPDATE/DELETE policy on any of the three tables — every write goes through a `SECURITY DEFINER` RPC:

- `get_or_create_direct_conversation(p_other_id)` — only between **accepted connections**, and rejected if either side has blocked the other. One conversation per unordered pair, found-or-created under the same `pg_advisory_xact_lock` pattern used for connections.
- `get_or_create_event_conversation(p_event_id)` — one group conversation per event; membership is granted lazily to the event's organizer or any `registered`/`attended` attendee who calls it, not pre-populated for the whole guest list.
- `get_or_create_opportunity_conversation(p_opportunity_id, p_applicant_id?)` — one conversation per (opportunity, applicant) pair, between that applicant and the opportunity's creator. There is no general "message request" path to a stranger — eligibility for all three conversation types is checked entirely server-side (accepted connection / registered attendee / applicant-or-employer), so a conversation simply can't be created outside those three contexts.
- `send_message(p_conversation_id, p_body)` — membership check, block check (direct conversations), and a rate limit (20 messages/60s per sender) all enforced in one transaction before the insert. Notifies the other member(s) via `notify()` with a **generic body** ("X sent you a message") — the message content itself never goes into a notification.
- `mark_conversation_read(p_conversation_id)` sets the caller's own `last_read_at`; `delete_message(p_message_id)` soft-deletes (sender-only), clearing `body` but keeping the row so the thread doesn't have a gap.
- `messages` and `conversation_members` are added to the `supabase_realtime` publication so the chat screen gets live inserts (and could get live read-receipts) via Postgres changes, filtered by the same RLS that governs normal reads.
