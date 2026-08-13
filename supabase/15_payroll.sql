-- Payroll Report: monthly Gross Salary, Overtime, Deductions, Air Ticket
-- Cost, and Net Pay per employee. The last deferred phase of the Power
-- BI-parity project (see CLAUDE.md "Current status"). Synthetic from day
-- one (no real source to reconcile against) — same philosophy as
-- workforce_category/New Hire Program, not the CTC Report module's
-- real-data-then-resynthesize approach.
--
-- Employee-level, so (unlike ctc_actuals/cost_center) it DOES FK to
-- employee_master, matching base_salary's convention. Upserted monthly by
-- (employee_id, period), same reasoning as ctc_actuals: a corrected month's
-- re-upload should only touch that month's rows.

create table payroll (
  id                bigint generated always as identity primary key,
  employee_id       text references employee_master(employee_id),
  period            date not null,
  gross_salary      numeric,
  overtime_amount   numeric,
  total_deductions  numeric,
  air_ticket_cost   numeric,
  net_pay           numeric,
  unique (employee_id, period)
);

create index on payroll (period);
create index on payroll (employee_id);

alter table payroll enable row level security;

-- New section id: "payroll". Add it to a user's user_access.sections (or
-- give them full_access) via the Manage Access panel, same as any other section.

create policy "sectioned read" on payroll for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['payroll']::text[])));

-- Upserted, not delete+insert — needs admin update as well as insert/delete
-- (same reasoning as ctc_actuals/ctc_budget in 12_ctc_report.sql).

create policy "admin insert" on payroll for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on payroll for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on payroll for delete to authenticated using (public.is_admin(auth.uid()));
