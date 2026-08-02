-- Run this AFTER data is imported (and after 02_add_fks.sql).
-- Enables Row Level Security on every table and grants read-only SELECT to the
-- anon role (the key the browser dashboard uses). Without this, the anon key
-- can read nothing at all once RLS is on — and today, with RLS off, these
-- tables are fully open to anyone holding the anon key. This makes the
-- read-only intent explicit and blocks INSERT/UPDATE/DELETE from the browser.

alter table employee_master enable row level security;
alter table org_hierarchy   enable row level security;
alter table salary_structure enable row level security;
alter table recruitment     enable row level security;
alter table diversity       enable row level security;
alter table attrition       enable row level security;
alter table base_salary     enable row level security;
alter table total_rewards   enable row level security;
alter table leave           enable row level security;
alter table absenteeism     enable row level security;
alter table performance     enable row level security;
alter table training        enable row level security;

create policy "anon read" on employee_master  for select to anon using (true);
create policy "anon read" on org_hierarchy    for select to anon using (true);
create policy "anon read" on salary_structure for select to anon using (true);
create policy "anon read" on recruitment      for select to anon using (true);
create policy "anon read" on diversity        for select to anon using (true);
create policy "anon read" on attrition        for select to anon using (true);
create policy "anon read" on base_salary      for select to anon using (true);
create policy "anon read" on total_rewards    for select to anon using (true);
create policy "anon read" on leave            for select to anon using (true);
create policy "anon read" on absenteeism      for select to anon using (true);
create policy "anon read" on performance      for select to anon using (true);
create policy "anon read" on training         for select to anon using (true);

-- Note: this makes every table readable by anyone who loads the dashboard URL —
-- fine for now since the data is synthetic, but before this carries real employee
-- data, swap "to anon" for "to authenticated" on the sensitive tables (base_salary,
-- total_rewards, performance, attrition) and add Supabase Auth + a login screen.
