-- Adds the Staff/Labor workforce classification Power BI's HR Executive Summary
-- and Attendance/Absence reports split by, which this schema never had.
--
-- Backfilled from job_level: Managerial/Executive tier -> "Staff" category,
-- Staff/Supervisory tier -> "Labor" category. Chosen over a department-based
-- split because it reproduces a realistic Labor-heavy ratio for this workforce
-- (~81% Labor / ~19% Staff here vs. Power BI's real 82.6%/17.4%) — a
-- department-based rule (e.g. Farm Operations/Production/Engineering/Supply
-- Chain = Labor) came out inverted (~74% Staff), since most headcount in every
-- department sits at the Staff/Supervisory job_level tier regardless of
-- department, and only that tier boundary reproduces the real ratio.
--
-- NOTE the naming collision this creates: job_level's own "Staff" value (an
-- org-hierarchy tier — Staff/Supervisory/Managerial/Executive) and
-- workforce_category's "Staff" value (white-collar vs. blue-collar) are
-- unrelated despite sharing the word, and mean opposite things at the
-- individual-contributor level. Same ambiguity exists in the source Power BI
-- model this is patterned after — not something introduced here.

alter table employee_master add column if not exists workforce_category text;

update employee_master
set workforce_category = case when job_level in ('Staff', 'Supervisory') then 'Labor' else 'Staff' end
where workforce_category is null;
