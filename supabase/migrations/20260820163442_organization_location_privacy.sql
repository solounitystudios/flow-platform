-- Organization Location Foundation — location privacy.
--
-- STATUS: drafted, NOT YET APPLIED to production. Waiting on explicit
-- founder authorization for the database deployment sequence (apply this
-- migration, verify organizations_public/location_visibility live,
-- regenerate lib/database.types.ts, then remove the temporary casts in
-- lib/data/discover.ts and lib/actions.ts that exist only because the
-- generated types don't know about these objects yet). Until then, this
-- file describes the schema the application code below is already written
-- against, not something currently live.
--
-- Today `organizations.lat`/`lng` (added by
-- 20260820091600_organizations_coordinates.sql, live but not yet consumed
-- anywhere) would, if populated, be shown at full precision to any public
-- caller — the table is fully public-read (`orgs_public_read using (true)`)
-- and there is no gate on which columns of a public-read row are exposed.
-- For a small/solo operator whose "organization" coordinates are really
-- their home address, that's an unwanted default. This adds the smallest
-- model that lets an organization control what its public location
-- actually reveals, without ever fabricating a location and without
-- requiring a full address-entry/geocoding feature (still future work —
-- see the DEFERRED items from the prior release).
--
-- location_visibility, four values:
--   'exact'       — show the real lat/lng at full precision.
--   'approximate' — show lat/lng rounded to 2 decimal places (~1.1km of
--                   fuzz at most latitudes) — enough for "this business is
--                   roughly in this neighborhood" without pinpointing an
--                   exact address.
--   'hidden'      — never expose lat/lng publicly at all. city/state (both
--                   already separate, already-public columns, unaffected
--                   by this migration) may still describe the general area
--                   in text form; no map pin.
--   'remote'      — same map behavior as 'hidden' (no pin) — this value
--                   exists so the public organization page can say "this
--                   business is remote" instead of implying it just
--                   chose not to share a real physical location.
--
-- Defaults to 'hidden' — the same "never expose without explicit opt-in"
-- posture as the rest of this batch's location-safety rules. A newly
-- created organization's lat/lng (today: always null anyway, since no
-- geocoding UI exists yet) will not become publicly visible the moment
-- someone eventually sets them, without the owner separately choosing
-- 'exact' or 'approximate'.
--
-- The real enforcement is `organizations_public`, a redacting view — RLS
-- on the base table is deliberately UNCHANGED (still `using (true)`,
-- already reviewed/accepted): an owner-authenticated context (e.g. a
-- future settings page) legitimately needs to read/edit its own exact
-- lat/lng regardless of the chosen visibility, so gating the base table
-- itself would be wrong. Postgres RLS is row-level, not
-- column-conditional-on-another-column, so a view is the correct minimal
-- tool for "redact this column's value based on that column's value" —
-- not a new pattern, same reasoning as passport_summary's existing
-- redaction-via-view approach. security_invoker = true: this view adds no
-- privilege the caller doesn't already have (organizations is already
-- fully public-read), it only reshapes/redacts columns, so it should run
-- with the querying role's own permissions, not bypass anything.
--
-- Application code: getDiscoverOrganizations (lib/data/discover.ts) and
-- the new public organization page selector should read from this view,
-- not the raw table, for any public-facing output. Owner-authenticated
-- reads (getOrganizationByOwner, getOrganizationForMember) are unaffected
-- and keep reading the raw table.
--
-- Backward compatibility: additive only — new column with a safe default,
-- new view. No existing column, policy, or query is touched.
--
-- Rollback (safe — 'hidden' is a conservative default, no real location
-- data exists on the one live organization row today):
--   drop view if exists public.organizations_public;
--   alter table public.organizations drop column if exists location_visibility;

alter table public.organizations
  add column if not exists location_visibility text not null default 'hidden'
    check (location_visibility in ('exact', 'approximate', 'hidden', 'remote'));

create view public.organizations_public
with (security_invoker = true) as
select
  id,
  name,
  description,
  city,
  state,
  org_type,
  verified,
  created_at,
  location_visibility,
  case location_visibility
    when 'exact' then lat
    when 'approximate' then round(lat::numeric, 2)
    else null
  end as lat,
  case location_visibility
    when 'exact' then lng
    when 'approximate' then round(lng::numeric, 2)
    else null
  end as lng
from public.organizations;

comment on view public.organizations_public is
  'Public-safe projection of organizations — lat/lng are redacted per-row based on location_visibility (exact/approximate rounded/hidden+remote null). security_invoker=true: adds no privilege beyond what the querying role already has via orgs_public_read, this view only reshapes columns. Use this view for any public-facing organization query (map pins, public organization page, discover listings); owner-authenticated reads should keep using the raw organizations table.';
