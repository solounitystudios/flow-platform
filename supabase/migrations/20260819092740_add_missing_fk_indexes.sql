-- Missing indexes on real foreign-key columns, limited to ones with a
-- concrete query pattern in the app (owner dashboards, admin case/task
-- lookups, Passport display, matching engine) — not a blanket "index
-- every FK" pass.

-- event_attendance: "my tickets" queries filter by profile_id alone; the
-- primary key is (event_id, profile_id) so profile_id isn't a usable
-- leftmost prefix. checked_in_by backs check-in audit views.
create index if not exists event_attendance_profile_id_idx on public.event_attendance (profile_id);
create index if not exists event_attendance_checked_in_by_idx on public.event_attendance (checked_in_by);

-- events / opportunities: business "my org" and "my postings" dashboards
-- filter by organization_id and created_by respectively; neither had a
-- covering index (only the city/state/status/starts_at composite existed).
create index if not exists events_organization_id_idx on public.events (organization_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists opportunities_organization_id_idx on public.opportunities (organization_id);
create index if not exists opportunities_created_by_idx on public.opportunities (created_by);

-- recommendations (Passport testimonials): recipient_id drives every
-- Passport-page read, author_id drives "recommendations I've given",
-- opportunity_id backs the hire-verified insert policy's EXISTS check.
create index if not exists recommendations_recipient_id_idx on public.recommendations (recipient_id);
create index if not exists recommendations_author_id_idx on public.recommendations (author_id);
create index if not exists recommendations_opportunity_id_idx on public.recommendations (opportunity_id);

-- match_recommendations: target_* are read on cascade-delete and any
-- reverse "who was recommended this" lookup; profile_id itself was
-- already covered by match_recommendations_profile_idx.
create index if not exists match_recommendations_target_profile_id_idx on public.match_recommendations (target_profile_id);
create index if not exists match_recommendations_target_opportunity_id_idx on public.match_recommendations (target_opportunity_id);
create index if not exists match_recommendations_target_skill_id_idx on public.match_recommendations (target_skill_id);

-- opportunity_skill_requirements: skill_id isn't a usable prefix of the
-- (opportunity_id, skill_id) primary key; generate_match_recommendations'
-- skill-gap analysis filters by skill_id directly.
create index if not exists opportunity_skill_requirements_skill_id_idx on public.opportunity_skill_requirements (skill_id);

-- organization_verification_cases: admin case lookups by org, by lead,
-- and "cases assigned to me" — none had a covering index.
create index if not exists organization_verification_cases_organization_id_idx on public.organization_verification_cases (organization_id);
create index if not exists organization_verification_cases_lead_id_idx on public.organization_verification_cases (lead_id);
create index if not exists organization_verification_cases_assigned_to_idx on public.organization_verification_cases (assigned_to);

-- outreach_tasks: lead_id's only existing index is a partial unique index
-- scoped to open+trigger_key rows, which the planner can't use for a
-- general "all tasks for this lead" query; assigned_to backs "my tasks".
create index if not exists outreach_tasks_lead_id_idx on public.outreach_tasks (lead_id);
create index if not exists outreach_tasks_assigned_to_idx on public.outreach_tasks (assigned_to);

-- outreach_activities: contact_id has no covering index at all
-- (lead_id is already covered by outreach_activities_lead_time_idx).
create index if not exists outreach_activities_contact_id_idx on public.outreach_activities (contact_id);
