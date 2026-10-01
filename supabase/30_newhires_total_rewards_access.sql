-- New Hires' "Hires Above Mid %" now compares TOTAL monthly cash (from
-- total_rewards) against the salary_structure band, not basic salary alone --
-- the real SAP bands are defined on total cash (see bandComparablePay in
-- app/js/data.js). total_rewards was only readable by the `compensation`
-- section, so a section-restricted New Hires user would see that KPI as
-- "n/a". Widen it to `newhires`, keeping 24_divisional_access.sql's
-- division check exactly as it was. Same reasoning as
-- 13_newhires_salary_access.sql's base_salary/salary_structure widening.

drop policy "sectioned read" on total_rewards;
create policy "sectioned read" on total_rewards for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['compensation','newhires']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = total_rewards.employee_id)));
