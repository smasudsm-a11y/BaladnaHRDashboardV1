-- Run this LAST, only after confirming login works end-to-end (task done above).
-- Removes the public "anon read" policies, so the data is only readable by
-- signed-in users. This is the step that actually closes off public access.

drop policy "anon read" on employee_master;
drop policy "anon read" on org_hierarchy;
drop policy "anon read" on salary_structure;
drop policy "anon read" on recruitment;
drop policy "anon read" on diversity;
drop policy "anon read" on attrition;
drop policy "anon read" on base_salary;
drop policy "anon read" on total_rewards;
drop policy "anon read" on leave;
drop policy "anon read" on absenteeism;
drop policy "anon read" on performance;
drop policy "anon read" on training;
