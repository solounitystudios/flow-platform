create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  city text not null default 'Buffalo',
  state text not null default 'NY',
  available_now boolean not null default false,
  reliability_score numeric(5,2) not null default 100 check (reliability_score between 0 and 100),
  flow_points integer not null default 0 check (flow_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  category text,
  created_at timestamptz not null default now()
);

create table public.profile_skills (
  profile_id uuid references public.profiles(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  verified boolean not null default false,
  verified_at timestamptz,
  primary key (profile_id, skill_id)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  city text,
  state text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  opportunity_type text not null check (opportunity_type in ('gig','job','project','volunteer')),
  status text not null default 'open' check (status in ('draft','open','filled','completed','cancelled')),
  city text not null default 'Buffalo',
  state text not null default 'NY',
  location_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  pay_cents integer check (pay_cents is null or pay_cents >= 0),
  slots integer not null default 1 check (slots > 0),
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied','accepted','declined','withdrawn','completed','no_show')),
  created_at timestamptz not null default now(),
  unique(opportunity_id, applicant_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  city text not null default 'Buffalo',
  state text not null default 'NY',
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'published' check (status in ('draft','published','cancelled','completed')),
  created_at timestamptz not null default now()
);

create table public.event_attendance (
  event_id uuid references public.events(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','attended','no_show','cancelled')),
  checked_in_at timestamptz,
  primary key(event_id, profile_id)
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (author_id <> recipient_id)
);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  verification_type text not null,
  reference_id uuid,
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.flow_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  entry_type text not null check (entry_type in ('earning','reward','adjustment')),
  amount_cents integer not null default 0,
  points integer not null default 0,
  description text,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);

create index opportunities_city_status_idx on public.opportunities(city,state,status,starts_at);
create index events_city_status_idx on public.events(city,state,status,starts_at);
create index applications_applicant_idx on public.applications(applicant_id,status);
create index ledger_profile_idx on public.flow_ledger(profile_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.profile_skills enable row level security;
alter table public.organizations enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.events enable row level security;
alter table public.event_attendance enable row level security;
alter table public.recommendations enable row level security;
alter table public.verifications enable row level security;
alter table public.flow_ledger enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy profiles_self_insert on public.profiles for insert with check (auth.uid() = id);
create policy profiles_self_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy skills_public_read on public.skills for select using (true);
create policy profile_skills_public_read on public.profile_skills for select using (true);
create policy profile_skills_self_manage on public.profile_skills for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy orgs_public_read on public.organizations for select using (true);
create policy orgs_owner_manage on public.organizations for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy opportunities_public_read on public.opportunities for select using (status <> 'draft' or auth.uid() = created_by);
create policy opportunities_creator_manage on public.opportunities for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy applications_parties_read on public.applications for select using (auth.uid() = applicant_id or exists (select 1 from public.opportunities o where o.id = opportunity_id and o.created_by = auth.uid()));
create policy applications_self_insert on public.applications for insert with check (auth.uid() = applicant_id);
create policy applications_self_update on public.applications for update using (auth.uid() = applicant_id) with check (auth.uid() = applicant_id);
create policy events_public_read on public.events for select using (status <> 'draft' or auth.uid() = created_by);
create policy events_creator_manage on public.events for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy attendance_participant_read on public.event_attendance for select using (auth.uid() = profile_id or exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid()));
create policy attendance_self_manage on public.event_attendance for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy recommendations_public_read on public.recommendations for select using (true);
create policy recommendations_author_insert on public.recommendations for insert with check (auth.uid() = author_id);
create policy recommendations_author_delete on public.recommendations for delete using (auth.uid() = author_id);
create policy verifications_self_read on public.verifications for select using (auth.uid() = profile_id);
create policy ledger_self_read on public.flow_ledger for select using (auth.uid() = profile_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into public.profiles(id, username, full_name)
 values (new.id, nullif(new.raw_user_meta_data->>'username',''), coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict (id) do nothing;
 return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace view public.passport_summary as
select p.id,
 p.username,
 p.full_name,
 p.city,
 p.state,
 p.available_now,
 p.reliability_score,
 p.flow_points,
 (select count(*) from public.applications a where a.applicant_id=p.id and a.status='completed') as gigs_completed,
 (select count(*) from public.profile_skills ps where ps.profile_id=p.id and ps.verified=true) as skills_verified,
 (select count(*) from public.event_attendance ea where ea.profile_id=p.id and ea.status='attended') as events_attended,
 (select count(*) from public.recommendations r where r.recipient_id=p.id) as recommendations,
 coalesce((select sum(l.amount_cents) from public.flow_ledger l where l.profile_id=p.id and l.entry_type='earning'),0) as earned_cents
from public.profiles p;
