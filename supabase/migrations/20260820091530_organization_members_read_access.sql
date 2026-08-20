-- Employer multi-admin foundation — Part B: read-only access increment.
--
-- Depends on public.is_organization_member() from
-- 20260820091500_organization_members_foundation.sql (this file must apply
-- after it). Now that an organization can have members beyond its single
-- `owner_id`, this closes the read-side gap that would otherwise leave
-- them: today `opportunities_creator_manage` / `events_creator_manage` and
-- the `applications`/`event_attendance` "owner" read branches all key off
-- `created_by = auth.uid()` alone, so an invited-and-active org member with
-- no `created_by` rows of their own currently sees nothing for their org's
-- postings, events, applicants, or attendance.
--
-- Adds four new *permissive* SELECT-only policies, each gated on
-- public.is_organization_member(organization_id) — active membership,
-- any role. Postgres OR-combines multiple permissive policies for the same
-- command and table, so these can only ever *add* read visibility for
-- active org members; no existing policy (owner-only write access,
-- applicant-self access, public-read visibility) is touched, narrowed, or
-- replaced.
--
-- No index migration needed here: opportunities.organization_id and
-- events.organization_id already have covering btree indexes
-- (opportunities_organization_id_idx / events_organization_id_idx, added in
-- 20260819092740_add_missing_fk_indexes.sql), and the applications/
-- event_attendance policies below reach organization_id only through an
-- EXISTS subquery keyed on opportunities.id / events.id (primary keys),
-- not through a new leftmost-column lookup.
--
-- Explicitly out of scope: any write access for members (that's a separate,
-- later, more carefully-scoped batch — member write access needs its own
-- role-based rules, e.g. can a 'recruiter' change an opportunity's status?
-- not decided here), and any UI consuming this.
--
-- Rollback: each policy is independent and purely additive; any subset can
-- be dropped without affecting the others or any pre-existing policy:
--   drop policy if exists opportunities_member_read on public.opportunities;
--   drop policy if exists events_member_read on public.events;
--   drop policy if exists applications_member_read on public.applications;
--   drop policy if exists attendance_member_read on public.event_attendance;

create policy opportunities_member_read
  on public.opportunities for select
  using (
    organization_id is not null
    and public.is_organization_member(organization_id)
  );

create policy events_member_read
  on public.events for select
  using (
    organization_id is not null
    and public.is_organization_member(organization_id)
  );

create policy applications_member_read
  on public.applications for select
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = applications.opportunity_id
        and o.organization_id is not null
        and public.is_organization_member(o.organization_id)
    )
  );

create policy attendance_member_read
  on public.event_attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_attendance.event_id
        and e.organization_id is not null
        and public.is_organization_member(e.organization_id)
    )
  );
