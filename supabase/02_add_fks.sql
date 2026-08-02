-- Run this AFTER all 12 CSVs are imported. If any table has orphaned employee_id values
-- (an id that doesn't exist in employee_master), the specific ALTER below will fail and name
-- the offending constraint — check that table's data if so, everything else will have succeeded.

alter table org_hierarchy add constraint org_hierarchy_employee_id_fkey foreign key (employee_id) references employee_master(employee_id);
alter table diversity     add constraint diversity_employee_id_fkey     foreign key (employee_id) references employee_master(employee_id);
alter table attrition     add constraint attrition_employee_id_fkey     foreign key (employee_id) references employee_master(employee_id);
alter table base_salary   add constraint base_salary_employee_id_fkey   foreign key (employee_id) references employee_master(employee_id);
alter table total_rewards add constraint total_rewards_employee_id_fkey foreign key (employee_id) references employee_master(employee_id);
alter table leave         add constraint leave_employee_id_fkey         foreign key (employee_id) references employee_master(employee_id);
alter table absenteeism   add constraint absenteeism_employee_id_fkey   foreign key (employee_id) references employee_master(employee_id);
alter table performance   add constraint performance_employee_id_fkey   foreign key (employee_id) references employee_master(employee_id);
alter table training      add constraint training_employee_id_fkey      foreign key (employee_id) references employee_master(employee_id);
