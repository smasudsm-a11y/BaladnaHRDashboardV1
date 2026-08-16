-- Power BI Parity Round 2, Phase F: modest schema additions (new columns,
-- not new tables — except budgeted_positions, see note near the bottom).
-- See CLAUDE.md "Power BI Parity — Round 2" for the full phase list.

-- 1. absenteeism.approval_status → Leave & Absence's "Unapproved Absences" KPI.
-- Backfill rule (deterministic, not random, matching every other backfill in
-- this app): Paid absences are always Approved (paid implies it was signed
-- off). Sick/Other unpaid absences are treated as approved-unpaid-leave
-- (e.g. approved unpaid leave for personal reasons). Late/Unplanned unpaid
-- absences are the closest proxy this schema has for a genuine no-call/
-- no-show — those are Unapproved. This yields ~3,643 of 12,109 rows (~30%)
-- as Unapproved, a meaningful nonzero KPI without being implausible.
alter table absenteeism add column if not exists approval_status text;

update absenteeism
set approval_status = case
  when paid_unpaid = 'Paid' then 'Approved'
  when paid_unpaid = 'Unpaid' and absence_type in ('Late', 'Unplanned') then 'Unapproved'
  else 'Approved'
end
where approval_status is null;

-- 2. workforce_category gets a third value, "Consultant", matching Power BI's
-- 3-way Staff/Labor/Consultant split (14_workforce_category.sql only had 2).
-- employee_type is the only existing field with a natural "non-permanent
-- engagement" concept (Permanent/Contract/Temporary) — Temporary (61 of 1,510
-- employees, ~4%) is the closest proxy to "Consultant" this schema has, so it
-- overrides the Staff/Labor rule for that subset. Not an "is null" backfill
-- like 14's (this table already has values) — an explicit reclassification,
-- naturally idempotent on rerun.
update employee_master
set workforce_category = 'Consultant'
where employee_type = 'Temporary';

-- 3. payroll.annual_leave_cost folds Leave & Absence's "Est. Annual Leave
-- Liability" KPI into a monthly-grain payroll figure, trended on the Payroll
-- Cost Trend chart instead of sitting as a single snapshot number on Leave.
-- Per employee-month: that employee's latest Annual leave balance as of the
-- period (same "latest record ≤ date" pattern as latestBaseSalary/
-- latestTotalRewards in data.js) × their base salary as of the period ÷ 30 —
-- identical formula to leave.js's own liability calc, just computed per period
-- instead of once against "today".
alter table payroll add column if not exists annual_leave_cost numeric;

update payroll p
set annual_leave_cost = round((coalesce(lv.leave_balance, 0) * coalesce(bs.base_salary, 0) / 30)::numeric, 2)
from payroll p2
left join lateral (
  select l.leave_balance from leave l
  where l.employee_id = p2.employee_id and l.leave_type = 'Annual' and l.leave_start_date <= p2.period
  order by l.leave_start_date desc limit 1
) lv on true
left join lateral (
  select b.base_salary from base_salary b
  where b.employee_id = p2.employee_id and b.salary_effective_date <= p2.period
  order by b.salary_effective_date desc limit 1
) bs on true
where p.id = p2.id;

-- 4. training.expiry_date + compliance_status → "Compliance Courses by
-- Expiry Status" chart. Only meaningful for training_category = 'Compliance'
-- rows that were actually completed (an incomplete course has no cert to
-- expire). Expiry = completion + 1 year (typical annual compliance cert
-- validity). compliance_status is computed once against this app's fixed
-- "today" (REFERENCE_TODAY = 2026-08-02 in data.js — this whole dataset is a
-- frozen synthetic snapshot as of that date, so a stored status computed
-- against it stays correct, unlike computing it against a real wall-clock date).
alter table training add column if not exists expiry_date date;
alter table training add column if not exists compliance_status text;

update training
set expiry_date = (completion_date + interval '1 year')::date
where training_category = 'Compliance' and completion_status = 'Completed' and expiry_date is null;

update training
set compliance_status = case
  when expiry_date is null then null
  when expiry_date < date '2026-08-02' then 'Expired'
  when expiry_date <= date '2026-08-02' + interval '60 days' then 'Expiring Soon'
  else 'Valid'
end
where training_category = 'Compliance';

-- 5. training.required_date → New Hire Program's detail table "Required Date"
-- column (the onboarding completion deadline). Entity Type and Supervisor
-- (the other two columns Phase F called for) need no schema change — they're
-- just employee_master.legal_entity / line_manager_name, not yet pulled into
-- nhp.js's withEmployeeFields list; see app/js/pages/nhp.js.
-- Deadline = hire date + 90 days, a typical NHP onboarding window.
alter table training add column if not exists required_date date;

update training t
set required_date = (e.hire_date + interval '90 days')::date
from employee_master e
where t.employee_id = e.employee_id and t.training_category = 'New Hire Program' and t.required_date is null;

-- 6. salary_structure.grade_tier → Compensation's "Salary Positioning by
-- Grade Tier" chart, split Staff vs. Labor. Grade-level (14 rows), not
-- employee-level, like workforce_category's job_level-tier backfill.
-- G13/G14 (22 employees total) lines up with employee_master's own
-- job_level = 'Executive' count (22) — a useful sanity check that the
-- boundary is in the right place, though the two concepts are independently
-- defined (job_level is org-hierarchy tier, grade_tier is pay-grade tier).
alter table salary_structure add column if not exists grade_tier text;

update salary_structure
set grade_tier = case
  when grade in ('G1', 'G2', 'G3', 'G4') then 'Junior'
  when grade in ('G5', 'G6', 'G7', 'G8') then 'Mid'
  when grade in ('G9', 'G10', 'G11', 'G12') then 'Senior'
  else 'Executive'
end
where grade_tier is null;

-- 7. budgeted_positions — the one genuine new table in this phase. Needed so
-- Recruitment's "Vacant Positions" means something distinct from "Open
-- Requisitions" (unclosed requisitions): a department-level headcount budget
-- has no natural home as a column on any existing row (it's not
-- per-requisition or per-employee data), so a small lookup table is the only
-- reasonable fit — everything else in this phase really was just a column.
-- Seeded as active headcount + an 8% buffer (minimum +1) per department, so
-- every department shows at least one vacant position.
create table budgeted_positions (
  department          text primary key,
  budgeted_headcount   integer not null
);

insert into budgeted_positions (department, budgeted_headcount)
select department, count(*) + greatest(1, round(count(*) * 0.08))::integer
from employee_master
where employment_status = 'Active'
group by department;

alter table budgeted_positions enable row level security;

create policy "sectioned read" on budgeted_positions for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['recruitment']::text[])));

create policy "admin insert" on budgeted_positions for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on budgeted_positions for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on budgeted_positions for delete to authenticated using (public.is_admin(auth.uid()));
