-- Divisional access for HRBPs. Layered on top of the existing section-based
-- model, not a replacement for it: a user still needs the relevant section
-- (or full_access) AND, if divisionally restricted, the row's division must
-- be in their assigned set. Empty/null `divisions` = unrestricted, same
-- meaning as `full_access` bypassing the section check — an HRBP who covers
-- multiple divisions just gets more than one entry in the array.
--
-- Deliberately NOT applied to: cost_centers/ctc_actuals/ctc_budget/
-- ctc_revenue (CTC visibility is Total Rewards/CEO-only already, per user
-- decision — HRBPs never get the "ctc" section at all, so this needs no
-- divisional logic); salary_structure (a grade-level pay-band reference,
-- same numbers regardless of division); kpi_targets/initiatives
-- (company-wide reference/tracker tables, no per-row division concept);
-- and article75_violations (weekly company-wide case-count only — the
-- source report never tracked individual cases, so there is no per-row
-- division to filter on at all; confirmed acceptable to leave this one
-- table company-wide for every Attendance-section user, per user decision).

alter table user_access add column divisions text[];

-- SECURITY DEFINER, same reasoning as public.is_admin(uid) in
-- 08_fix_admin_recursion.sql: a policy that subqueries user_access while
-- itself protecting a table joined back to user_access would otherwise
-- risk "infinite recursion detected in policy." Wrapping the lookup in a
-- SECURITY DEFINER function sidesteps that the same way is_admin() does.
create or replace function public.division_allowed(uid uuid, row_division text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_access ua
    where ua.user_id = uid
      and (
        ua.full_access
        or ua.divisions is null
        or array_length(ua.divisions, 1) is null
        or row_division = any(ua.divisions)
      )
  );
$$;

-- ---- Tables with their own `division` column already ----

drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment','succession','probation-pip','enps','headcount-forecast']::text[]))
  and public.division_allowed(auth.uid(), division));

drop policy "sectioned read" on org_hierarchy;
create policy "sectioned read" on org_hierarchy for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['headcount']::text[]))
  and public.division_allowed(auth.uid(), division));

drop policy "sectioned read" on critical_positions;
create policy "sectioned read" on critical_positions for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession','exec']::text[]))
  and public.division_allowed(auth.uid(), division));

drop policy "sectioned read" on headcount_forecast;
create policy "sectioned read" on headcount_forecast for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['headcount-forecast']::text[]))
  and public.division_allowed(auth.uid(), division));

drop policy "sectioned read" on excess_hours_violations;
create policy "sectioned read" on excess_hours_violations for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['attendance']::text[]))
  and public.division_allowed(auth.uid(), division));

-- ---- Tables joined to employee_master via employee_id (no division column
-- of their own — employee_id is that table's primary key, so this scalar
-- subquery always returns at most one row) ----

drop policy "sectioned read" on diversity;
create policy "sectioned read" on diversity for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['diversity']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = diversity.employee_id)));

drop policy "sectioned read" on attrition;
create policy "sectioned read" on attrition for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','diversity','attrition']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = attrition.employee_id)));

drop policy "sectioned read" on base_salary;
create policy "sectioned read" on base_salary for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave','compensation','newhires','payroll']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = base_salary.employee_id)));

drop policy "sectioned read" on total_rewards;
create policy "sectioned read" on total_rewards for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['compensation']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = total_rewards.employee_id)));

drop policy "sectioned read" on leave;
create policy "sectioned read" on leave for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = leave.employee_id)));

drop policy "sectioned read" on absenteeism;
create policy "sectioned read" on absenteeism for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = absenteeism.employee_id)));

drop policy "sectioned read" on performance;
create policy "sectioned read" on performance for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['performance','attrition']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = performance.employee_id)));

drop policy "sectioned read" on training;
create policy "sectioned read" on training for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['training']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = training.employee_id)));

drop policy "sectioned read" on payroll;
create policy "sectioned read" on payroll for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['payroll']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = payroll.employee_id)));

drop policy "sectioned read" on probation_reviews;
create policy "sectioned read" on probation_reviews for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['probation-pip']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = probation_reviews.employee_id)));

drop policy "sectioned read" on pip_records;
create policy "sectioned read" on pip_records for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['probation-pip']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = pip_records.employee_id)));

drop policy "sectioned read" on exit_surveys;
create policy "sectioned read" on exit_surveys for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['enps']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = exit_surveys.employee_id)));

drop policy "sectioned read" on stage_gate_scores;
create policy "sectioned read" on stage_gate_scores for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['enps','exec']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = stage_gate_scores.employee_id)));

-- ---- incumbents/successors: joined through critical_positions.division
-- (the POSITION's division, not the incumbent's/successor's) — a vacant
-- critical role still belongs to a division regardless of who, if anyone,
-- currently holds or is lined up for it. position_id is critical_positions'
-- primary key, so this is always at most one row. ----

drop policy "sectioned read" on incumbents;
create policy "sectioned read" on incumbents for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession']::text[]))
  and public.division_allowed(auth.uid(), (select cp.division from critical_positions cp where cp.position_id = incumbents.position_id)));

drop policy "sectioned read" on successors;
create policy "sectioned read" on successors for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession','exec']::text[]))
  and public.division_allowed(auth.uid(), (select cp.division from critical_positions cp where cp.position_id = successors.position_id)));

-- ---- recruitment/budgeted_positions: no employee_id at all (recruitment
-- is pre-hire/candidate-level; budgeted_positions is department-level), so
-- neither can join through employee_master by id. Both only carry
-- `department`, so this joins by department NAME instead — verified 1:1
-- against employee_master (Baladna's 13 departments each map to exactly one
-- division, no department spans two), with `limit 1` because a scalar
-- subquery must return at most one row and many employee_master rows share
-- the same department (all resolving to the same division value). ----

drop policy "sectioned read" on recruitment;
create policy "sectioned read" on recruitment for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['recruitment','diversity']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.department = recruitment.department limit 1)));

drop policy "sectioned read" on budgeted_positions;
create policy "sectioned read" on budgeted_positions for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['recruitment']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.department = budgeted_positions.department limit 1)));
