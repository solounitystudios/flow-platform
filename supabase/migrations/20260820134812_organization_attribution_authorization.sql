-- FLOW-SEC-001 — Cross-Organization Listing Attribution fix.
--
-- Vulnerability: createOpportunityAction/createEventAction (lib/actions.ts)
-- accept a plain client-supplied `organization_id` hidden form field with no
-- server-side ownership check, and the RLS policies backing both writes
-- (`opportunities_creator_manage`, `events_creator_manage`, both `for all`)
-- only ever verified `auth.uid() = created_by` — never that the caller is
-- actually authorized to attribute content to the named organization. Since
-- a Server Action is directly POST-able independent of what the rendered
-- form pre-fills, any authenticated FLOW member could attribute a public
-- opportunity or event to *any* organization's id, including a real,
-- verified business they have no relationship to. This grants no access to
-- that organization's private data or membership, but it is a genuine
-- public-content forgery/impersonation vector.
--
-- Live-data audit before this migration (read-only, via Supabase MCP):
-- exactly one opportunity row and one event row currently carry a non-null
-- organization_id, and both are legitimately owned (created_by is that
-- organization's owner_id) — so tightening this check breaks no existing
-- row and requires no data cleanup.
--
-- Fix, matching the current product's explicitly conservative scope
-- (organization posting rights belong to the owner only — member posting
-- is intentionally deferred, not granted here, and no blanket admin
-- override for content creation exists today, so none is added):
-- `organization_id is null` (an unattributed/personal posting — unchanged
-- behavior) OR the caller owns the named organization
-- (`organizations.owner_id = auth.uid()`, the same ownership check already
-- used by organization_members_owner_invite/owner_manage, deliberately not
-- `is_organization_member()` since that would also admit non-owner active
-- members, which this batch does not grant posting rights to).
--
-- This is added to WITH CHECK only, on the existing `for all` policy — USING
-- (row visibility for the caller's own SELECT/UPDATE/DELETE-via-this-policy)
-- is untouched, so an owner's existing ability to see/update/cancel their
-- own postings is unaffected. Because WITH CHECK re-evaluates the full
-- resulting row on every INSERT and UPDATE, this is naturally immutable in
-- effect: the app has no code path that updates organization_id after
-- creation (only status-only updates exist), and if one is ever added, it
-- would be re-authorized by this same check automatically — no separate
-- "prevent reassignment" trigger is needed.
--
-- Admin behavior: unaffected. No blanket "admin can write opportunities/
-- events" RLS policy exists today — the only admin write surface is the two
-- narrow SECURITY DEFINER RPCs (admin_set_opportunity_status /
-- admin_set_event_status) that touch only the `status` column, added in
-- 20260820053340_admin_content_read_and_moderation_rpcs.sql. This migration
-- does not add a new admin bypass, per FLOW-SEC-001's explicit scope.
--
-- Anon behavior: unaffected. `auth.uid()` is null for anon, so
-- `auth.uid() = created_by` was already always false for anon; this adds an
-- AND condition, which can only ever narrow further, never open anon access.
--
-- organization_members interaction: none — deliberately not referenced, per
-- FLOW-SEC-001's explicit "member posting is deferred" scope.
--
-- Backward compatibility: purely a WITH CHECK tightening; no column added,
-- dropped, or renamed. Rollback (safe, purely reverts to the pre-fix
-- policy — only do this if the vulnerability is intentionally reopened,
-- which should never happen without a replacement fix already in place):
--   drop policy if exists opportunities_creator_manage on public.opportunities;
--   create policy opportunities_creator_manage on public.opportunities for all
--     using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
--   drop policy if exists events_creator_manage on public.events;
--   create policy events_creator_manage on public.events for all
--     using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

drop policy if exists opportunities_creator_manage on public.opportunities;
create policy opportunities_creator_manage on public.opportunities for all
  using ((select auth.uid()) = created_by)
  with check (
    (select auth.uid()) = created_by
    and (
      organization_id is null
      or exists (
        select 1 from public.organizations o
        where o.id = opportunities.organization_id
          and o.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists events_creator_manage on public.events;
create policy events_creator_manage on public.events for all
  using ((select auth.uid()) = created_by)
  with check (
    (select auth.uid()) = created_by
    and (
      organization_id is null
      or exists (
        select 1 from public.organizations o
        where o.id = events.organization_id
          and o.owner_id = (select auth.uid())
      )
    )
  );
