-- Run this LAST, after every workbook in the SAP cutover runbook has been
-- uploaded through the Data Refresh panel (see
-- scripts/sap-migration/RUNBOOK.md) -- not before.
--
-- employee_master is upserted, not delete+insert (10_employee_master_upsert.sql),
-- so uploading the new real Employee Master workbook only ADDS the 3,148 new
-- rows (raw SAP employee numbers, e.g. "100002") -- it does not remove the
-- 1,510 old synthetic rows (all of which use the "BLD-100002" prefix format,
-- confirmed directly: every single old row matches that prefix, no
-- exceptions). Those old rows can't be deleted until nothing references them
-- any more, which is only true once every dependent table (org_hierarchy,
-- diversity, attrition, base_salary, total_rewards, leave, absenteeism,
-- performance, training, payroll, incumbents, successors, probation_reviews,
-- pip_records, exit_surveys, stage_gate_scores) has already been re-uploaded
-- with the new real data -- otherwise this DELETE fails on an FK violation.
--
-- payroll is the ONE exception among those 15 -- its Data Refresh card is
-- upserted by (employee_id, period), same as employee_master, not
-- delete+insert like the other 14. Re-uploading 14_Payroll_Report.xlsx
-- therefore left its old BLD-* rows in place too (confirmed the hard way:
-- this is what threw the very first time this script ran -- "update or
-- delete on table employee_master violates foreign key constraint
-- payroll_employee_id_fkey"). Cleaned up here directly rather than expecting
-- a separate manual step to be remembered.
delete from payroll where employee_id like 'BLD-%';

delete from employee_master where employee_id like 'BLD-%';
