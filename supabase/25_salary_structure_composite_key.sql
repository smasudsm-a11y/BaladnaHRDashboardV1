-- Power BI Parity SAP migration: salary_structure's key changes from `grade`
-- alone to composite (grade, job_family, currency).
--
-- Real Position Data (SAP) proved Grade alone is not a safe lookup key: even
-- within Qatar alone (single currency), the same Grade label carries
-- multiple distinct Sal. Min/Mid/Max bands depending on job family -- e.g.
-- Grade-12 QAR/Qatar has 62 positions split across 3 different bands, from
-- 2,027-2,533 up to 5,700-7,130. Adding Job Family as a second key resolves
-- 159 of 166 (Grade, Job Family) combos in Qatar to a single band; the
-- remaining 7 stay ambiguous and were resolved manually (see
-- scripts/sap-migration/salary_structure_ambiguous_combos.csv) rather than
-- redesigning the key further.
--
-- Currency is a third key column, not folded into job_family or dropped:
-- (Grade, Job Family) alone still collides across countries -- the same
-- combo shows up with both a QAR-scale band and an EGP-scale band, which
-- isn't real ambiguity, just two different currencies sharing a label.
-- Egypt's own (Grade, Job Family) combos have zero internal ambiguity (17
-- of 17 resolve cleanly) once separated by currency this way.
--
-- This is a breaking change for anything that looked salary_structure up by
-- grade alone -- db.salaryStructureIndex in app/js/data.js, and its 3
-- readers (compensation.js, newhires.js, underpaid-overpaid.js), all
-- updated in this same change to key by (grade, job_family, currency)
-- instead, using the employee's own base_salary.currency.

-- Wipes the existing 14 grade-only rows -- they're being replaced wholesale
-- by the (grade, job_family, currency) rows below, and a composite primary
-- key can't be added while any row still has a null job_family/currency.
-- Upload the new "Salary Structure Data" sheet
-- (scripts/sap-migration/salary_structure_draft.csv) via the Data Refresh
-- panel immediately after running this, or Compensation/New Hires/
-- Underpaid & Overpaid will show blank salary bands until it's reloaded.
delete from salary_structure;

alter table salary_structure add column if not exists job_family text;
alter table salary_structure add column if not exists currency text;
alter table salary_structure drop constraint salary_structure_pkey;
alter table salary_structure add primary key (grade, job_family, currency);
