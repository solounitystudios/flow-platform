-- ============================================================
-- BATCH A: Event Team Builder Integration
--
-- Lets an organizer link a staffing opportunity to a specific event,
-- reusing the existing opportunities/applications lifecycle as-is
-- (no new tables, no new state machine).
--
-- Organization integrity (an opportunity may only be linked to an event
-- owned by the same organization, or — for an organization-less personal
-- event — by the same creator) and the "never auto-create an
-- event_attendance ticket for staff" rule are both enforced in the
-- application layer (lib/authz.ts canLinkOpportunityToEvent,
-- lib/actions.ts createOpportunityAction), not here. Existing
-- opportunities_creator_manage / opportunities_public_read RLS policies
-- already cover this column with no change needed, since event_id is a
-- purely informational link, not a new access-control surface.
-- ============================================================

alter table public.opportunities
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists opportunities_event_id_idx on public.opportunities(event_id);
