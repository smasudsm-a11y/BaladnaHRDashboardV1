-- Power BI Parity Round 2, Phase I: Probation & PIP — a new module,
-- synthetic from day one (no real probation/PIP roster exists to
-- reconcile against), same philosophy as Payroll/Attendance Violations/
-- Succession Planning. See CLAUDE.md "Power BI Parity — Round 2" for the
-- full phase list, and scripts/probation-pip-data/generate_probation_pip_data.ps1
-- for exactly how outcomes were derived from real employee_master/
-- performance fields (early termination timing, subsequent rating trend) —
-- nothing here is a random draw.

create table probation_reviews (
  id                     bigint generated always as identity primary key,
  employee_id            text references employee_master(employee_id),
  probation_start_date   date,
  review_date            date,
  outcome                text check (outcome in ('Confirmed', 'Extended', 'Not Confirmed'))
);

create table pip_records (
  id               bigint generated always as identity primary key,
  employee_id      text references employee_master(employee_id),
  pip_start_date   date,
  reason           text,
  month3_status    text check (month3_status in ('Improved', 'Not Improved', 'Terminated')),
  month6_status    text check (month6_status in ('Completed Successfully', 'Not Improved', 'Terminated'))
);

create index on probation_reviews (employee_id);
create index on pip_records (employee_id);

alter table probation_reviews enable row level security;
alter table pip_records enable row level security;

-- New section id: "probation-pip". Add it to a user's user_access.sections
-- (or give them full_access) via the Manage Access panel, same as any
-- other section.

create policy "sectioned read" on probation_reviews for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['probation-pip']::text[])));

create policy "sectioned read" on pip_records for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['probation-pip']::text[])));

-- Delete+insert on refresh (no upsert key) — like Succession Planning, this
-- is a point-in-time roster Total Rewards replaces wholesale when revised,
-- not an accumulating monthly table.

create policy "admin insert" on probation_reviews for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on probation_reviews for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on probation_reviews for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on pip_records for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on pip_records for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on pip_records for delete to authenticated using (public.is_admin(auth.uid()));

-- Widen employee_master's sectioned-read policy to include "probation-pip" —
-- the page joins both tables back to employee_master client-side (name,
-- department, grade, etc.), same reasoning as every prior widening in this
-- file's history (13/16/18).
drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment','succession','probation-pip']::text[])));
