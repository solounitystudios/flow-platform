create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_not_self check (requester_id <> recipient_id)
);

create unique index connections_unique_pair
  on public.connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));

create index connections_requester_idx on public.connections (requester_id);
create index connections_recipient_idx on public.connections (recipient_id);

alter table public.connections enable row level security;

create policy connections_parties_read
  on public.connections for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

create policy connections_requester_insert
  on public.connections for insert
  with check (auth.uid() = requester_id);

create policy connections_recipient_update
  on public.connections for update
  using (auth.uid() = recipient_id and status = 'pending')
  with check (auth.uid() = recipient_id);

create policy connections_parties_delete
  on public.connections for delete
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
