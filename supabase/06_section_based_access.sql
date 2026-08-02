-- Section-based access control: some users see every dashboard tab, others only
-- the ones relevant to them. One row per user in user_access — manage it directly
-- via Table Editor (find the user's UUID under Authentication > Users, or just
-- use the email-based INSERT pattern at the bottom of this file for new users).
--
-- valid section ids: exec, headcount, recruitment, newhires, diversity,
-- compensation, attrition, leave, performance, training

create table user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,                              -- for readability only, not authoritative
  full_access boolean not null default false,
  sections text[] not null default '{}'::text[]
);

alter table user_access enable row level security;

create policy "read own access row" on user_access
  for select to authenticated
  using (auth.uid() = user_id);

-- Give the existing test account full access so nobody gets locked out.
insert into user_access (user_id, email, full_access, sections)
select id, email, true, '{}'::text[]
from auth.users
where email = 's.masud@baladna.com'
on conflict (user_id) do update set full_access = true;

-- Replace the blanket "any authenticated user" policies from 04_add_authenticated_read.sql
-- with per-table, per-section ones. A table is readable if the caller either has
-- full_access, or has at least one of the sections listed for that table — several
-- tables are read by more than one page's calculations (e.g. Executive Insights
-- summarizes attrition/leave/absence/salary data, so it needs read access to those
-- raw tables too, since the aggregation happens client-side).

drop policy "authenticated read" on employee_master;
drop policy "authenticated read" on org_hierarchy;
drop policy "authenticated read" on salary_structure;
drop policy "authenticated read" on recruitment;
drop policy "authenticated read" on diversity;
drop policy "authenticated read" on attrition;
drop policy "authenticated read" on base_salary;
drop policy "authenticated read" on total_rewards;
drop policy "authenticated read" on leave;
drop policy "authenticated read" on absenteeism;
drop policy "authenticated read" on performance;
drop policy "authenticated read" on training;

create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training']::text[])));

create policy "sectioned read" on org_hierarchy for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['headcount']::text[])));

create policy "sectioned read" on salary_structure for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['compensation']::text[])));

create policy "sectioned read" on recruitment for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['recruitment','diversity']::text[])));

create policy "sectioned read" on diversity for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['diversity']::text[])));

create policy "sectioned read" on attrition for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','diversity','attrition']::text[])));

create policy "sectioned read" on base_salary for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave','compensation']::text[])));

create policy "sectioned read" on total_rewards for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['compensation']::text[])));

create policy "sectioned read" on leave for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave']::text[])));

create policy "sectioned read" on absenteeism for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','leave']::text[])));

create policy "sectioned read" on performance for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['performance']::text[])));

create policy "sectioned read" on training for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['training']::text[])));

-- Template for granting a new restricted user access to specific sections only
-- (run once per new hire/manager — swap in the real email + section list):
--
-- insert into user_access (user_id, email, full_access, sections)
-- select id, email, false, array['recruitment','newhires']
-- from auth.users
-- where email = 'someone@baladna.com';
