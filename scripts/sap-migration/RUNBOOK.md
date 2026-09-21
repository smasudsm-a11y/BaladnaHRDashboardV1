# SAP real-data cutover — runbook

Everything below is staged and reviewed, but **nothing has been run against
Supabase or committed to git yet**. Follow these steps in order — the order
matters because of foreign keys.

Workbooks referenced below are in `scripts/sap-migration/workbooks/` (built
from the `*_draft.csv` files in this same folder by `build_workbooks.ps1`).

## Why this order

`employee_master` is **upserted** by `employee_id`, not delete+insert. The
new real rows use the raw SAP employee number (e.g. `"100002"`); the old
1,510 synthetic rows all use the `"BLD-100002"` prefix format. Uploading the
new Employee Master workbook therefore **adds** the 3,148 new rows without
removing the old ones — which is exactly what we want at this point, because
16 other tables still have a foreign key into `employee_master.employee_id`,
and none of those FKs cascade. If the old rows were deleted before every
dependent table had already switched to the new employee IDs, the delete
would fail with a foreign-key violation.

So: load the new employee_master rows first (they just add alongside the
old ones), reload every dependent table (each replaces its own old rows
with new ones, which is safe once the new employee_master rows already
exist), and only then delete the now-unreferenced old employee_master rows.

## Step 1 — Supabase SQL Editor: salary_structure schema change

Run `supabase/25_salary_structure_composite_key.sql`. This is independent
of everything else (salary_structure has no employee_id FK) — safe to run
any time. It wipes the 14 old grade-only rows and changes the primary key
to `(grade, job_family, currency)`.

## Step 2 — Data Refresh panel: Employee Master

Log in as an admin → **Admin → Data Refresh** → find the **"01 — Employee
Master"** card → upload `01_Employee_Master.xlsx`. Review the preview, then
confirm. This adds 3,148 rows; the old 1,510 stay for now (expected).

## Step 3 — Data Refresh panel: everything else, any order

Upload each of the following. Each one replaces only its own table, and
that's now safe because Step 2 already gave every new employee_id somewhere
to point to.

| Card | Workbook |
| --- | --- |
| 02 — Organizational Hierarchy | `02_Organizational_Hierarchy.xlsx` |
| 05 — Diversity Dashboard | `05_Diversity_Dashboard.xlsx` |
| 06 — Attrition Dashboard | `06_Attrition_Dashboard.xlsx` |
| 07 — Compensation Dashboard | `07_Compensation_Dashboard.xlsx` (Base Salary + Total Rewards + Salary Structure, 3 sheets) |
| 08 — Leave Dashboard | `08_Leave_Dashboard.xlsx` |
| 09 — Absenteeism Dashboard | `09_Absenteeism_Dashboard.xlsx` |
| 10 — Performance Dashboard | `10_Performance_Dashboard.xlsx` |
| 11 — Learning & Training Dashboard | `11_Learning_Training_Dashboard.xlsx` |
| 13a — CTC Cost Centers | `13a_CTC_Cost_Centers.xlsx` |
| 14 — Payroll Report | `14_Payroll_Report.xlsx` |
| 15 — Succession Planning | `15_Succession_Planning.xlsx` (Critical Positions + Incumbents + Successors, 3 sheets) |
| 16 — Budgeted Positions | `16_Budgeted_Positions.xlsx` |
| 16 — Probation & PIP | `16_Probation_PIP.xlsx` (Probation Reviews + PIP Records, 2 sheets) |
| 18 — Employee Satisfaction | `17_Employee_Satisfaction.xlsx` (Exit Surveys + Stage Gate Scores, 2 sheets) |

Not included — deliberately left alone this round:
- **13b/13c/13d (CTC Actuals/Budget/Revenue)** and **13a's own division/
  department mapping content** — per your instruction, CTC data is coming
  later, separately. Don't touch it.
- **Recruitment**, **KPI Targets**, **Initiatives**, **Headcount Forecast**
  — no real source in this SAP batch, and not part of the "regenerate
  placeholders" scope (Recruitment has no generator at all yet; the other
  3 aren't employee_id-dependent, so they weren't blocking the cutover).
- **Attendance Violations** — separate operational population, no
  employee_id FK, unaffected by any of this.

## Step 4 — Supabase SQL Editor: clean up the old employee_master rows

Only after every card in Step 3 has been uploaded successfully. Run
`supabase/26_cleanup_old_employee_master.sql`. It now also cleans up
`payroll` first — that card is the one exception among the 15: it's
upserted by `(employee_id, period)`, same as employee_master itself, not
delete+insert like every other card, so re-uploading it alone doesn't
remove its old `BLD-*` rows (this is exactly what threw the first time
this ran — a foreign key violation from `payroll_employee_id_fkey`).

If it still fails with a foreign key violation after this fix, something
else in Step 3 didn't finish — check the Data Refresh history table (top
of the Data Refresh page) for which card is still showing old row counts,
re-upload it, then retry this delete.

## After cutover — verify

- Headcount should jump from ~1,510 to ~3,148 (or whatever's currently
  Active — check the Executive Insights or Headcount page's Current
  Headcount KPI).
- Check a few pages that were flagged `dataStatus: "partial"` in the nav
  (Executive Insights, Diversity, Leave & Absence, Attrition, Succession
  Planning, Headcount Forecast) — the still-partial pieces (absenteeism was
  regenerated so this one's now fully real; `successors` and Executive's
  Succession Coverage %/Employee Lifecycle Score are the ones that still
  have real gaps even after this cutover).
- The pages flagged `dataStatus: "needs-input"` should now show *populated*
  data again (regenerated placeholders, not real) instead of being blank —
  Recruitment is the one exception, since it never got a generator this
  round.

## Known open items, not blocking this cutover

See `project_sap_real_data_migration` in the assistant's memory for the
full list (job_level's 9-tier change, the 2 genuine salary-band ties, etc.)
— all already reviewed and resolved earlier in this project, kept here only
as a pointer.
