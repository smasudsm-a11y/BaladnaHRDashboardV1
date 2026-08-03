-- Attendance Violations dashboard: Excess Hours (event-level) + Article 75
-- Violations (weekly case-count only — the source weekly report never tracks
-- individual Article 75 cases, only a count).
--
-- This is a DIFFERENT employee population from employee_master: the broader
-- operational/biometric-tracked workforce (Farms, Warehouses, Fleet, Retail
-- field staff, etc.), not the corporate people-data model the rest of this
-- dashboard is built on. No FK to employee_master — rows are self-contained,
-- same as the source report's own per-instance detail.

create table excess_hours_violations (
  id              bigint generated always as identity primary key,
  employee_id     text,
  employee_name   text,
  job_title       text,
  division        text,
  department      text,
  section         text,
  violation_date  date,
  clock_in        text,
  clock_out       text,
  total_hours     numeric,
  manager_name    text
);

create index on excess_hours_violations (violation_date);
create index on excess_hours_violations (division);

create table article75_violations (
  id          bigint generated always as identity primary key,
  week_start  date,
  week_end    date,
  case_count  integer not null default 0
);

create index on article75_violations (week_start);

alter table excess_hours_violations enable row level security;
alter table article75_violations enable row level security;

-- New section id: "attendance". Add it to a user's user_access.sections (or
-- give them full_access) via the Manage Access panel, same as any other section.

create policy "sectioned read" on excess_hours_violations for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['attendance']::text[])));

create policy "sectioned read" on article75_violations for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['attendance']::text[])));

-- Admin insert/delete for the Data Refresh panel (mirrors 09_data_refresh.sql).
-- Both tables are leaf tables (nothing FK-references them), so the normal
-- delete-then-insert replace pattern is safe here — no upsert needed.

create policy "admin delete" on excess_hours_violations for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on excess_hours_violations for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on article75_violations for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on article75_violations for insert to authenticated with check (public.is_admin(auth.uid()));
