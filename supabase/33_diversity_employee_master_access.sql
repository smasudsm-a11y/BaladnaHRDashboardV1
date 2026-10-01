-- Diversity & Inclusion needs employee_master (2026-10-01): to count only
-- current employees (the diversity table holds everyone, including the
-- 1,181 who have left), for the Legal Entity filter, and for real hire/exit
-- dates in "Workforce Flow by Gender". `diversity` was never in
-- employee_master's sectioned-read list, so a user granted only Diversity
-- saw an empty page. Recreated from 29_promotion_history.sql's version plus
-- 'diversity'. 'enps' and 'headcount-forecast' are dropped: those modules
-- were removed from the dashboard the same day.

drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','diversity','compensation','attrition','leave','performance','training','recruitment','succession','probation-pip','promotions']::text[]))
  and public.division_allowed(auth.uid(), division));
