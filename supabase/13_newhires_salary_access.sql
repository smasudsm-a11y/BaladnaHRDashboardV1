-- Two new cross-table KPIs need broader section access than currently granted.
-- Same drop+recreate pattern as 06_section_based_access.sql (Postgres has no
-- ALTER POLICY for the USING clause).
--
-- 1. New Hires & Onboarding's "Hires Above Mid %" (starting salary vs. grade
--    midpoint at hire) needs base_salary and salary_structure — neither was
--    previously readable by the 'newhires' section.
-- 2. Recruitment's "Vacancy Rate" (open requisitions ÷ active headcount + open
--    requisitions) needs employee_master headcount — not previously readable
--    by the 'recruitment' section.

drop policy "sectioned read" on base_salary;
create policy "sectioned read" on base_salary for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave','compensation','newhires']::text[])));

drop policy "sectioned read" on salary_structure;
create policy "sectioned read" on salary_structure for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['compensation','newhires']::text[])));

drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment']::text[])));
