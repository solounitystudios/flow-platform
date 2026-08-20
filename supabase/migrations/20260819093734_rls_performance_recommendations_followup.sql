-- Finish wrapping auth.uid() on recommendations' remaining two policies
-- (recommendations_read was already fixed in passport_privacy_rls; these
-- two were untouched at the time). Same table, same no-semantics-change
-- rule as rls_performance_hardening.

drop policy if exists recommendations_author_insert on public.recommendations;
create policy recommendations_author_insert on public.recommendations for insert
  with check (
    (select auth.uid()) = author_id
    and opportunity_id is not null
    and exists (
      select 1 from public.applications a
      join public.opportunities o on o.id = a.opportunity_id
      where a.opportunity_id = recommendations.opportunity_id
        and a.applicant_id = recommendations.recipient_id
        and a.status = 'completed'
        and o.created_by = (select auth.uid())
    )
  );

drop policy if exists recommendations_author_delete on public.recommendations;
create policy recommendations_author_delete on public.recommendations for delete
  using ((select auth.uid()) = author_id);
