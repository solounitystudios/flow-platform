-- Map V2 — organizations coordinates.
--
-- opportunities.lat/lng and events.lat/lng (both nullable plain `numeric`,
-- no precision/scale, no default — confirmed against live schema) already
-- back the existing map surface. organizations has no coordinate columns at
-- all yet, which blocks placing an organization itself (as opposed to its
-- individual postings/events) on the map. Adds the same two columns to
-- organizations, typed identically, for full parity.
--
-- No RLS change: organizations is already publicly readable in full
-- (`orgs_public_read using (true)`), so these two new nullable columns are
-- visible under the exact same policy the rest of the row already is —
-- nothing new to gate. No index: neither opportunities.lat/lng nor
-- events.lat/lng are indexed today, so this stays consistent with that
-- rather than introducing an inconsistency for organizations alone.
--
-- Independent of, and safe to apply in any order relative to, the
-- organization_members migrations in this same batch.
--
-- Rollback (safe pre-population; would discard any populated coordinates
-- once set on real rows, same caveat as any column drop against a table
-- that could hold real data):
--   alter table public.organizations drop column if exists lat, drop column if exists lng;

alter table public.organizations
  add column if not exists lat numeric,
  add column if not exists lng numeric;
