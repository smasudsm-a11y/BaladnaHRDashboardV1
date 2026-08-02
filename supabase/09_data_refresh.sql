-- Data refresh: lets an admin upload updated Excel workbooks from the dashboard
-- itself, replacing a table's contents, with a history log of who/when/how many.

create table data_refresh_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  row_count    integer not null,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);

alter table data_refresh_log enable row level security;

create policy "admin read log" on data_refresh_log
  for select to authenticated
  using (public.is_admin(auth.uid()));

create policy "admin write log" on data_refresh_log
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

-- All 12 data tables are currently read-only from the browser (sectioned SELECT
-- policies only). Add admin-only INSERT/DELETE so the Data Refresh panel can
-- clear and reload a table. Note: an admin doing this also needs full_access
-- (or the relevant sections) to read a table's current row count for the
-- preview step — recommend giving data-refresh admins full_access too.

create policy "admin delete" on employee_master  for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on employee_master  for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on org_hierarchy    for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on org_hierarchy    for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on salary_structure for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on salary_structure for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on recruitment      for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on recruitment      for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on diversity        for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on diversity        for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on attrition        for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on attrition        for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on base_salary      for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on base_salary      for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on total_rewards    for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on total_rewards    for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on leave            for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on leave            for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on absenteeism      for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on absenteeism      for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on performance      for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on performance      for insert to authenticated with check (public.is_admin(auth.uid()));

create policy "admin delete" on training         for delete to authenticated using (public.is_admin(auth.uid()));
create policy "admin insert" on training         for insert to authenticated with check (public.is_admin(auth.uid()));
