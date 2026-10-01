-- Official pay scales (2026-10-01). Total Rewards supplied Baladna Qatar's
-- official Expat scale (G2-G7, G9-G24; G8 has no range) and Qatari National
-- scale (G10-G24). Both are by GRADE only, not job family. Until now
-- salary_structure was derived from per-position ranges in SAP Position
-- Data, which treated nationals as expats and let mis-keyed positions define
-- whole (grade, job family) ranges.
--
-- New `pay_scale` column so one grade can hold more than one range:
--   'Expat'         official Qatar expat scale   (job_family = 'ALL')
--   'National'      official Qatari national scale (job_family = 'ALL')
--   'Syria Project' USD project ranges converted at 3.64 (per grade + job family)
--   'Standard'      Egypt's ranges, still derived from Position Data
-- Which scale applies to an employee is decided in app/js/data.js
-- (payScaleFor). The data itself is loaded by re-uploading
-- "07 - Compensation Dashboard" -- its Salary Structure sheet gains a
-- "Pay Scale" column.
--
-- Same reasoning as 25_salary_structure_composite_key.sql: the existing
-- rows have no pay_scale, so clear them before re-keying; the upload
-- replaces the whole table anyway.

delete from salary_structure;

alter table salary_structure add column if not exists pay_scale text not null default 'Standard';
alter table salary_structure drop constraint salary_structure_pkey;
alter table salary_structure add primary key (grade, job_family, currency, pay_scale);
