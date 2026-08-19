-- FLOW Admin + Employer Outreach MVP.
--
-- This file is a source-control reconstruction of a migration that was
-- applied directly to the live database by a different environment whose
-- GitHub integration lacked write access to push the commit. Every object
-- below was verified against the live database (pg_proc, pg_policy,
-- information_schema, pg_constraint, pg_indexes, information_schema.triggers)
-- before this file was written — nothing here was newly applied by writing
-- this file; it documents what already exists.
--
-- Security model:
--   - public.admins is the sole authority for "is this person an admin" —
--     never a hidden nav link or client-trusted flag.
--   - public.is_flow_admin(require_aal2) is the single choke point every
--     outreach/admin table's RLS policy calls through. AAL2 (MFA) is
--     required by default; pass require_aal2 => false only where an AAL1
--     admin legitimately needs read access (there is no such case in this
--     migration — every policy below requires AAL2).
--   - Every table gets a BEFORE UPDATE updated_at trigger (where the
--     column exists) and an AFTER INSERT/UPDATE/DELETE audit trigger into
--     admin_audit_log — audit logging is a side effect of the database
--     trigger, not something the application has to remember to call.
--   - business_leads (cold prospects, not yet real FLOW businesses) is
--     kept entirely separate from the existing public.organizations table.
--     lead_organization_links is the only bridge, created once an invited
--     employer actually creates their own organization.

-- ── admins: extend with role/active/granted_by/updated_at ────────────────

alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins add column if not exists active boolean not null default true;
alter table public.admins add column if not exists granted_by uuid references public.profiles(id) on delete set null;
alter table public.admins add column if not exists updated_at timestamptz not null default now();

alter table public.admins add constraint admins_role_check
  check (role in ('owner', 'admin', 'operations', 'sales'));

-- Admin membership itself is granted out-of-band (there is no product
-- surface for an admin to grant another admin) — the only RLS policy on
-- this table is a self-read, so a signed-in admin can see their own role.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select
  using (auth.uid() = profile_id);

-- ── is_flow_admin: the single authority every policy below relies on ─────

create or replace function public.is_flow_admin(require_aal2 boolean default true)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.admins a
    where a.profile_id = auth.uid()
      and a.active
  ) and (
    not require_aal2
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;

revoke all on function public.is_flow_admin(boolean) from public;
grant execute on function public.is_flow_admin(boolean) to authenticated;

-- ── shared trigger functions ──────────────────────────────────────────────

create or replace function public.set_admin_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_time_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read on public.admin_audit_log for select
  using (public.is_flow_admin(true));

create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare payload jsonb;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.admin_audit_log(actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), lower(tg_op), tg_table_name, payload ->> 'id',
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- ── business_leads: cold prospects, deliberately separate from organizations ─

create table public.business_leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  category text not null,
  address text,
  neighborhood text,
  city text not null default 'Buffalo',
  region text not null default 'NY',
  postal_code text,
  website_url text,
  social_url text,
  general_email text,
  general_phone text,
  staffing_problems text,
  typical_roles text[] not null default '{}',
  hiring_frequency text,
  best_contact_method text check (best_contact_method is null or best_contact_method in ('visit','call','email','social','referral')),
  pipeline_stage text not null default 'identified' check (pipeline_stage in (
    'identified','researched','contact_attempted','decision_maker_reached',
    'demo_scheduled','demo_completed','pilot_offered','pilot_accepted',
    'onboarding_started','organization_verified','first_opportunity_posted',
    'first_opportunity_completed','repeat_employer','not_interested','follow_up_later'
  )),
  interest_level text not null default 'unknown' check (interest_level in ('unknown','low','medium','high')),
  source text,
  consent_notes text,
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_leads_category_idx on public.business_leads (category, neighborhood);
create index business_leads_pipeline_idx on public.business_leads (pipeline_stage, next_action_at);

alter table public.business_leads enable row level security;
create policy business_leads_admin_all on public.business_leads for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger business_leads_updated_at before update on public.business_leads
  for each row execute function public.set_admin_updated_at();
create trigger business_leads_audit after insert or update or delete on public.business_leads
  for each row execute function public.log_admin_change();

-- ── business_contacts ─────────────────────────────────────────────────────

create table public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads(id) on delete cascade,
  full_name text not null,
  title text,
  email text,
  phone text,
  preferred_method text check (preferred_method is null or preferred_method in ('visit','call','email','social','referral')),
  is_decision_maker boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_contacts_lead_idx on public.business_contacts (lead_id);

alter table public.business_contacts enable row level security;
create policy business_contacts_admin_all on public.business_contacts for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger business_contacts_updated_at before update on public.business_contacts
  for each row execute function public.set_admin_updated_at();
create trigger business_contacts_audit after insert or update or delete on public.business_contacts
  for each row execute function public.log_admin_change();

-- ── outreach_activities: call/email/visit/meeting/demo history ──────────

create table public.outreach_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads(id) on delete cascade,
  contact_id uuid references public.business_contacts(id) on delete set null,
  method text not null check (method in ('visit','call','email','social','meeting','demo','other')),
  occurred_at timestamptz not null default now(),
  outcome text not null,
  notes text,
  objections text,
  interest_level text check (interest_level is null or interest_level in ('low','medium','high')),
  documents_sent text[] not null default '{}',
  follow_up_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index outreach_activities_lead_time_idx on public.outreach_activities (lead_id, occurred_at desc);

alter table public.outreach_activities enable row level security;
create policy outreach_activities_admin_all on public.outreach_activities for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger outreach_activities_audit after insert or update or delete on public.outreach_activities
  for each row execute function public.log_admin_change();

-- ── outreach_tasks: follow-ups and due dates ─────────────────────────────

create table public.outreach_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.business_leads(id) on delete cascade,
  title text not null,
  details text,
  task_type text not null default 'follow_up' check (task_type in ('follow_up','call','visit','email','demo','onboarding','verification','other')),
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outreach_tasks_due_idx on public.outreach_tasks (status, due_at);

alter table public.outreach_tasks enable row level security;
create policy outreach_tasks_admin_all on public.outreach_tasks for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger outreach_tasks_updated_at before update on public.outreach_tasks
  for each row execute function public.set_admin_updated_at();
create trigger outreach_tasks_audit after insert or update or delete on public.outreach_tasks
  for each row execute function public.log_admin_change();

-- ── outreach_templates: copy-only, no send capability ────────────────────

create table public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  channel text not null check (channel in ('email','phone','visit','sms','other')),
  subject text,
  body text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_templates enable row level security;
create policy outreach_templates_admin_all on public.outreach_templates for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger outreach_templates_updated_at before update on public.outreach_templates
  for each row execute function public.set_admin_updated_at();
create trigger outreach_templates_audit after insert or update or delete on public.outreach_templates
  for each row execute function public.log_admin_change();

-- ── employer_invitations: token stored as a one-way hash only ───────────

create table public.employer_invitations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads(id) on delete cascade,
  token_hash text not null unique,
  intended_email text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.employer_invitations enable row level security;
create policy employer_invitations_admin_all on public.employer_invitations for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger employer_invitations_audit after insert or update or delete on public.employer_invitations
  for each row execute function public.log_admin_change();

-- ── pilot_agreements ──────────────────────────────────────────────────────

create table public.pilot_agreements (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','offered','accepted','declined','expired','cancelled')),
  offered_at timestamptz,
  accepted_at timestamptz,
  terms_summary text,
  internal_notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pilot_agreements enable row level security;
create policy pilot_agreements_admin_all on public.pilot_agreements for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger pilot_agreements_updated_at before update on public.pilot_agreements
  for each row execute function public.set_admin_updated_at();
create trigger pilot_agreements_audit after insert or update or delete on public.pilot_agreements
  for each row execute function public.log_admin_change();

-- ── lead_organization_links: the only bridge between leads and organizations ─

create table public.lead_organization_links (
  lead_id uuid primary key references public.business_leads(id) on delete cascade,
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  linked_by uuid not null default auth.uid() references public.profiles(id),
  linked_at timestamptz not null default now()
);

alter table public.lead_organization_links enable row level security;
create policy lead_organization_links_admin_all on public.lead_organization_links for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger lead_organization_links_audit after insert or update or delete on public.lead_organization_links
  for each row execute function public.log_admin_change();

-- ── organization_verification_cases ──────────────────────────────────────

create table public.organization_verification_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.business_leads(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','in_review','information_requested','approved','rejected','closed')),
  requirements jsonb not null default '{}'::jsonb,
  findings jsonb not null default '{}'::jsonb,
  decision_reason text,
  assigned_to uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_verification_cases_check check (lead_id is not null or organization_id is not null)
);

create index verification_cases_status_idx on public.organization_verification_cases (status, created_at);

alter table public.organization_verification_cases enable row level security;
create policy organization_verification_cases_admin_all on public.organization_verification_cases for all
  using (public.is_flow_admin(true)) with check (public.is_flow_admin(true));

create trigger organization_verification_cases_updated_at before update on public.organization_verification_cases
  for each row execute function public.set_admin_updated_at();
create trigger organization_verification_cases_audit after insert or update or delete on public.organization_verification_cases
  for each row execute function public.log_admin_change();

-- ── seed: 10 copy-only outreach templates (no send capability anywhere) ──

insert into public.outreach_templates (name, channel, subject, body) values
  ('Introduction email', 'email', 'A faster way to fill local roles',
   'Hi {{contact_name}}, I''m building FLOW to help Buffalo businesses find verified local people for jobs, gigs, events, and projects. Could I show you a 10-minute demo this week?'),
  ('Follow-up email', 'email', 'Following up on FLOW',
   'Hi {{contact_name}}, following up on FLOW and the staffing needs we discussed. Would {{suggested_time}} work for a quick demo?'),
  ('Restaurant walk-in pitch', 'visit', null,
   'I''m local and building FLOW to help Buffalo restaurants fill urgent shifts with verified nearby workers. Who handles staffing here, and could I schedule a 10-minute demo?'),
  ('Event promoter pitch', 'visit', null,
   'FLOW helps local promoters recruit event staff, vendors, creatives, and attendees in one place. I''d like to show you a pilot built for Buffalo events.'),
  ('Nonprofit pitch', 'email', 'Local volunteers and talent through FLOW',
   'FLOW helps Buffalo nonprofits reach local volunteers, workers, and community members without juggling disconnected tools. Could we discuss a pilot?'),
  ('Demo confirmation', 'email', 'Your FLOW demo is confirmed',
   'Your FLOW demo is confirmed for {{demo_time}}. We''ll focus on your current staffing needs and create a sample opportunity together.'),
  ('Pilot invitation', 'email', 'Invitation to become a FLOW pilot employer',
   'You''re invited to join the first group of FLOW pilot employers in Buffalo. Use this secure invitation: {{invite_url}}'),
  ('First posting reminder', 'email', 'Ready for your first FLOW posting',
   'Your FLOW business profile is ready. Let''s publish your first opportunity and start measuring response and fill time.'),
  ('Employer reactivation', 'email', 'Ready to post again on FLOW?',
   'It''s been a while since your last FLOW posting. Do you have any upcoming shifts, projects, events, or hiring needs we can help fill?'),
  ('Employer feedback request', 'email', 'How did FLOW work for you?',
   'What worked, what didn''t, and what would make FLOW more useful for your next opportunity? Your feedback directly shapes the Buffalo pilot.');

-- ── fix pre-existing Security Definer View advisor warnings ──────────────
-- passport_summary and reliability_breakdown predate this migration; their
-- query logic is unchanged here — only the view option is added, so every
-- row they return is still filtered by the querying user's own RLS grants
-- rather than the view definer's.

alter view public.passport_summary set (security_invoker = true);
alter view public.reliability_breakdown set (security_invoker = true);
