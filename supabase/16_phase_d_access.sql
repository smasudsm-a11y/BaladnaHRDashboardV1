-- Round 2, Phase D: two new cross-table KPIs need broader section access than
-- currently granted. Same drop+recreate pattern as 06_section_based_access.sql
-- (Postgres has no ALTER POLICY for the USING clause).
--
-- 1. Attrition's "High Performer Retention %" (joins performance.overallRating
--    against employee status) needs performance — not previously readable by
--    the 'attrition' section.
-- 2. Payroll's "Net Salary by Grade" chart (joins payroll rows to
--    base_salary.grade) needs base_salary — not previously readable by the
--    'payroll' section.

drop policy "sectioned read" on performance;
create policy "sectioned read" on performance for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['performance','attrition']::text[])));

drop policy "sectioned read" on base_salary;
create policy "sectioned read" on base_salary for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave','compensation','newhires','payroll']::text[])));
