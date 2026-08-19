create index if not exists applications_applicant_id_idx on public.applications (applicant_id);
create index if not exists notifications_profile_id_created_at_idx on public.notifications (profile_id, created_at desc);
