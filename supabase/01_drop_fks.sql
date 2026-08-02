-- Run this BEFORE importing the CSVs, so import order no longer matters.
-- Re-add the constraints afterward with 02_add_fks.sql once all 12 tables are loaded.

alter table org_hierarchy drop constraint if exists org_hierarchy_employee_id_fkey;
alter table diversity     drop constraint if exists diversity_employee_id_fkey;
alter table attrition     drop constraint if exists attrition_employee_id_fkey;
alter table base_salary   drop constraint if exists base_salary_employee_id_fkey;
alter table total_rewards drop constraint if exists total_rewards_employee_id_fkey;
alter table leave         drop constraint if exists leave_employee_id_fkey;
alter table absenteeism   drop constraint if exists absenteeism_employee_id_fkey;
alter table performance   drop constraint if exists performance_employee_id_fkey;
alter table training      drop constraint if exists training_employee_id_fkey;
