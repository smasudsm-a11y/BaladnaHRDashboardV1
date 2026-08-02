-- Grants logged-in users (the "authenticated" role) the same read access the anon
-- policies currently give. Run this now so login actually works; we'll drop the
-- anon policies separately once everything else is confirmed working, to finish
-- closing off public access.

create policy "authenticated read" on employee_master  for select to authenticated using (true);
create policy "authenticated read" on org_hierarchy    for select to authenticated using (true);
create policy "authenticated read" on salary_structure for select to authenticated using (true);
create policy "authenticated read" on recruitment      for select to authenticated using (true);
create policy "authenticated read" on diversity        for select to authenticated using (true);
create policy "authenticated read" on attrition        for select to authenticated using (true);
create policy "authenticated read" on base_salary      for select to authenticated using (true);
create policy "authenticated read" on total_rewards    for select to authenticated using (true);
create policy "authenticated read" on leave            for select to authenticated using (true);
create policy "authenticated read" on absenteeism      for select to authenticated using (true);
create policy "authenticated read" on performance      for select to authenticated using (true);
create policy "authenticated read" on training         for select to authenticated using (true);
