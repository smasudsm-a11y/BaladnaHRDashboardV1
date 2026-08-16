# Baladna HR Analytics Dashboard Suite

A static HTML/CSS/JS dashboard (no build step, no framework) reading live from
Supabase, deployed as a Render Static Site. Built incrementally — see "Build
history" below for what exists and in what order it was added.

## Current status (2026-08-16, later same day) — read this first if resuming

**Round 1** of the phased plan to close gaps between this dashboard and a
separate, much larger Power BI suite Group IT built for Power International
Holding (the parent group Baladna sits under — that suite is Group-wide,
multi-company; this app is Baladna-only, by explicit user decision, not an
oversight) is done. It was declared "complete" below, but that call turned
out to be premature: it was based on prose recall of an earlier screenshot
comparison, not a real page-by-page audit. When the user re-shared the same
15 Power BI screenshots and asked for an actual comparison, reading every
page's source code + the live schema turned up a long list of real gaps —
whole missing modules (Succession Planning, Employee Satisfaction/eNPS,
Headcount Forecast, Probation & PIP), not just missing charts. **Round 2**
(below) is the fix for that gap, phased and written down this time
specifically so it doesn't have to be redone from scratch again. Phase D, E,
F, G, H, I, and J are all done as of this note. Several were built in
parallel sessions with no fixed merge order, which is why the migration
numbers don't track the phase letters: F landed ahead of E the same day; G
and H merged in sequence (H first, hence G's migration landing on 19
instead of 18 — 18 went to H's `18_succession_planning.sql`); I and J
likewise merged in sequence (I first, hence J's migration landing on 21
instead of 20 — 20 went to I's `20_probation_pip.sql`). Phase K is now also
done (migration 22 — no letter/number gap this time, since no other Round 2
phase branch was in flight concurrently). **Phase L (migration 23) is now
also done — Round 2 is complete.** It rolled Succession Coverage %,
Employee Lifecycle Score, and a small Initiatives tracker onto Executive
Insights; the "target lines on existing KPIs" part of its own plan turned
out to already be satisfied by Phase G's `turnover_rate` targetDelta on
Executive's "Attrition Rate (TTM)", so no further work was needed there.
If you need the original screenshots again anyway (e.g.
to re-verify a phase after it's built), ask the user — they aren't stored
in this repo.

**Done and merged** (Phases A, B, C, and Payroll):
- Phase A: Legal Entity/Localization surfaced on Headcount & Diversity,
  Pre/Post-Calibration ratings on Performance, Salary Positioning by Quartile
  on Compensation.
- Phase B: Retention Rate/Separation Type/Workforce Tenure on Attrition,
  Vacancy Rate on Recruitment, Hires Above Mid % on New Hires, Total Completed
  by Title + detail table on Training.
- Phase C: Staff/Labor `workforce_category` split (`14_workforce_category.sql`,
  surfaced on Headcount + Leave's absenteeism KPIs), New Hire Program page
  (`nhp.js`, reuses the `training` table).
- Payroll: new `payroll` table (`15_payroll.sql`) and `payroll.js` page —
  monthly Gross Salary, Overtime, Deductions, Air Ticket Cost, Net Pay, by
  Division/Department/Workforce Category — synthetic from day one, same
  philosophy as `workforce_category`/New Hire Program, not the CTC Report
  module's real-data-then-resynthesize approach. See the Payroll Report
  gotcha below for the generation formulas. This was the last deferred item;
  the two scope decisions noted in earlier revisions of this file (Baladna-
  only, no separate "CTC Details" page) were honored throughout.

**Also added, outside the Power BI-parity project**: Zee, an in-dashboard AI
chat assistant (`app/js/zee.js` + the `zee-chat` Supabase Edge Function) —
see the Zee gotcha below for its access-control design (deliberately has no
database access at all) and the one manual Dashboard step it needs
(`ANTHROPIC_API_KEY` secret) that isn't tracked anywhere else in this file's
numbered migration list, since it's not a migration.

## Power BI Parity — Round 2 (started 2026-08-13)

Full re-audit against the same 15 Power BI screenshots as Round 1, this time
reading every one of this app's 20 page files + the live schema directly
instead of relying on memory. **CTC-related gaps and the Footprint tab are
explicitly excluded from this plan** (user decision, 2026-08-13 — Footprint
was never screenshotted anyway). Phased roughly cheapest/lowest-risk first;
later phases depend on earlier ones' tables existing.

- **Phase D — done.** Quick wins, no new tables (new charts/KPIs over
  existing data only): "Headcount by Grade" and "Headcount by Position
  Title" charts on Headcount; "Net Salary by Grade" and "Net Salary by
  Nationality" (full breakdown, not just Qatari/non-Qatari) on Payroll, plus
  "Net Pay — Staff"/"Net Pay — Labor" headline KPIs (previously
  filter-only); a monthly Staff-vs-Labor absenteeism % trend chart on
  Leave & Absence, plus "Total Working Days"/"Days till YTD" KPIs; a
  monthly completion-trend chart and an "Assigned/Completed by Grade"
  chart on Training; "Appraisals" count + "Completion %" KPIs and a
  "Post-Calibration Average by Grade" chart on Performance; a "High
  Performer Retention %" KPI on Attrition (joins `performance.overallRating`
  against `employee_master`'s current status — no new table, just new page
  logic + wider RLS access, see `16_phase_d_access.sql`).
  Two RLS widenings were needed even though no schema changed: Attrition's
  "High Performer Retention %" needs `db.performance` (not previously
  granted to the `attrition` section), and Payroll's "Net Salary by Grade"
  needs `db.latestBaseSalary` for the grade join (not previously granted to
  the `payroll` section) — both added in `16_phase_d_access.sql`, plus the
  matching `SECTION_TABLES` entries in `data.js`.
- **Phase E — done.** Underpaid & Overpaid Analysis (`underpaid-overpaid.js`,
  new page, existing data): reuses `base_salary`/`salary_structure`, the
  same data Compensation's quartile chart already reads. Headline $
  shortfall/excess KPIs (Σ difference from grade min/max) and
  severity-banded distribution charts (0–9%, 10–19%, 20–29%, 30–39%, 40%+)
  for both underpaid and overpaid. `meta.section: "compensation"` — shares
  that access grant, same mechanism as `nhp.js` sharing `training`'s; needed
  no `data.js`/RLS changes at all, since any user granted `compensation`
  already has the `compensation` page id in `allowedIds`, whose own
  `SECTION_TABLES` entry already fetches everything this page reads.
- **Phase F — done** (built 2026-08-16, in parallel with Phase E above, out
  of build order but landed the same day — the user asked for F
  specifically ahead of E). Modest schema additions, all in
  `17_phase_f.sql`, mostly new columns as planned — except
  `budgeted_positions`, which needed a small new lookup table after all (see
  below):
  - `absenteeism.approval_status` (deterministic backfill: Paid → Approved;
    Unpaid Sick/Other → Approved (approved-unpaid-leave); Unpaid Late/
    Unplanned → Unapproved, the closest proxy this schema has for a genuine
    no-call/no-show — ~30% of rows) → Leave & Absence's new "Unapproved
    Absences" KPI.
  - `workforce_category` gets a third value, "Consultant" — `employee_type =
    'Temporary'` (61 of 1,510 employees) now overrides the Staff/Labor rule
    from `14_workforce_category.sql`, since Temporary is the only existing
    field with a "non-permanent engagement" concept close to Consultant.
  - `payroll.annual_leave_cost`: same formula as Leave's own "Est. Annual
    Leave Liability" (latest Annual leave balance × base salary ÷ 30), just
    evaluated per employee-month instead of once against "today" — Leave's
    KPI is unchanged (still a live snapshot), Payroll additionally trends it
    monthly on the Payroll Cost Trend chart and a new KPI card. Also wired
    into `generate_payroll_data.ps1`/`build_payroll_workbook.ps1` so a
    from-scratch regeneration stays in sync with the live schema.
  - `training.expiry_date` + `training.compliance_status`, backfilled only
    for completed Compliance-category rows (expiry = completion + 1 year;
    status computed once against this app's fixed "today", `2026-08-02`,
    same reasoning as everything else in this app that avoids a real
    wall-clock date) → Training's new "Compliance Courses by Expiry Status"
    chart.
  - `training.required_date` (hire date + 90 days, NHP's onboarding
    deadline) → NHP's detail table "Required Date" column. Its other two
    planned columns, Entity Type and Supervisor, needed no schema change —
    they're `employee_master.legalEntity`/`lineManagerName`, just not
    previously in `nhp.js`'s `withEmployeeFields` list.
  - `salary_structure.grade_tier` (G1–G4 Junior, G5–G8 Mid, G9–G12 Senior,
    G13–G14 Executive — G13/14's 22 employees happens to match
    `job_level`'s own Executive count, a useful sanity check though the two
    tiers are independently defined) → Compensation's new "Salary
    Positioning by Grade Tier" chart, avg range penetration % grouped by
    tier, Staff vs. Labor.
  - `budgeted_positions` (department → budgeted headcount, active headcount
    + 8% buffer, min +1): the one item that didn't fit as a column — a
    department-level headcount budget has no natural home on any existing
    row. New table, `recruitment` section RLS, and a Data Refresh card
    ("16 — Budgeted Positions", upserted by department, no source workbook —
    seeded directly by the migration). Recruitment's "Vacant Positions" KPI
    (budgeted − active headcount, by department) is now distinct from
    "Open Requisitions" (unclosed requisition count), as planned.
- **Phase G — done** (built 2026-08-16). Targets/Benchmarks: a small,
  cross-cutting `kpi_targets` table (`19_phase_g.sql` — metric id → label,
  target value, `direction`, so good/bad is computed generically rather
  than hardcoded per KPI) surfaced as a delta/target line on 4 rate KPIs
  across the 3 pages Phase G named: `turnover_rate` (target 10.0%,
  lower-is-better) on both Attrition's "Overall Attrition Rate" and
  Executive's "Attrition Rate (TTM)" — the one metric genuinely shared
  across pages; `retention_rate` (target 90.0%, higher-is-better) on
  Attrition's "Retention Rate"; `absenteeism_rate_staff`/
  `absenteeism_rate_labor` (targets 2.5%/4.0%, lower-is-better, split
  because Leave & Absence's own KPIs are already split Staff vs. Labor) on
  Leave & Absence. Target values are invented benchmarks (no real Power BI
  target data exists to reconcile against here, unlike CTC Report) — the
  shared `targetDelta(db, metricId, actualValue)` helper in `data.js`
  computes the delta/color generically off `direction`, and returns `{}`
  (no delta rendered) for a section-restricted user without `kpi_targets`
  read access, so it degrades safely rather than erroring. New Data Refresh
  card ("17 — KPI Targets", upserted by `metric_id`, no source workbook —
  seeded directly by the migration, same pattern as `budgeted_positions`)
  so targets can be revised without a new migration.
- **Phase H — done** (built 2026-08-16). Succession Planning, a new module
  and new nav group, synthetic from day one (see `18_succession_planning.sql`
  and `scripts/succession-data/` — same philosophy as Payroll/Attendance
  Violations, not the CTC Report module's real-data-then-resynthesize
  approach). 3 new tables, matching the phase's own plan:
  `critical_positions` (45 rows, step-sampled from the 174 active
  Managerial/Executive employees so the roster spans every department
  without naming literally every leadership role; `criticality` derived
  deterministically from the position_title itself — "Chief Officer"/"Head
  of Department" → Critical, "Senior Manager" → High, else Medium),
  `incumbents` (one row per position — a separate table rather than columns
  on `critical_positions`, since "Position Holders"/"Incumbents detail
  table" are their own Power BI report sections; ~14% deliberately left
  vacant — every 7th sampled position — with `retirement_risk` derived from
  the incumbent's age), and `successors` (0–2 named successors per position
  in a fixed 0/1/2/1 rotation, so ~1 in 4 positions has a genuine succession
  gap; `readiness` derived from the successor's own tenure, with the 2nd
  successor slot deliberately drawn from a rotating depth into the
  candidate pool rather than always the next-longest-tenured person, since
  that flattened every pick into "Ready Now" — see the generator script's
  own comments for why). New page `succession.js` covers all 6 named Power
  BI sections: Critical Roles (by department/criticality), Position Holders
  (the Incumbents detail table), Vacancies (a Filled-vs-Vacant KPI/chart),
  Successor Readiness (by band), High-Potential Employees (successors
  flagged `is_high_potential`), plus a "Positions Without a Named Successor"
  gap chart. New `succession` section id — auto-appears in Manage Access
  (admin.js's checkbox grid derives its list from NAV, no admin.js changes
  needed) and needed one RLS widening: `employee_master`'s sectioned-read
  policy now includes `succession`, same reasoning as every prior widening
  in this file's history (13/16). New "15 — Succession Planning" Data
  Refresh card (3 sheets, delete+insert like `recruitment`/`diversity` —
  a full roster snapshot, not an accumulating table). One real bug caught
  before it ever reached the live database: the Data Refresh panel's
  generic replace logic deletes-then-inserts each of a multi-sheet upload's
  sheets **sequentially** (not all-deletes-then-all-inserts), so a
  re-upload's delete of `critical_positions` would hit a foreign-key
  violation against the OLD `incumbents`/`successors` rows still pointing
  at it (they aren't cleared until their own sheet's turn comes later in
  the same upload) — fixed with `on delete cascade` on both tables'
  `position_id` foreign keys.
- **Phase I — done** (built 2026-08-16). Probation & PIP, a new module and
  nav group, synthetic from day one (see `20_probation_pip.sql` and
  `scripts/probation-pip-data/` — same philosophy as Succession Planning).
  2 new tables, matching the phase's own plan:
  - `probation_reviews`: one row per employee — the **full** 1,510-employee
    population (matching this app's other historical tables like
    attrition/leave, not a narrow "currently onboarding" slice), review
    date = hire date + 90 days. Outcome is derived from real signals, not
    assigned arbitrarily: terminated within the 90-day window → Not
    Confirmed (22, 1.5%); not terminated early but their earliest recorded
    performance rating was Below Expectations → Extended (47, 3.1%);
    otherwise → Confirmed (1,441, 95.4%).
  - `pip_records`: one row per employee whose most recent recorded
    performance rating was Below Expectations (127 of the ~1,235 employees
    with any performance history). `pip_start_date` = that review date + 3
    weeks. Both milestones are derived from whatever real signal follows —
    a later annual performance cycle's rating, or an early termination —
    not random: terminated within 90 days of PIP start → both milestones
    Terminated; terminated within 180 days → 3-month Not Improved, 6-month
    Terminated; a later cycle exists and is still Below Expectations → both
    Not Improved; a later cycle exists and improved → 3-month Improved,
    6-month Completed Successfully; **no later cycle exists at all** (the
    triggering review was their most recent, e.g. a 2025 rating with no
    2026 cycle in this dataset yet) and no qualifying termination → both
    milestones default to a positive outcome (the only fallback this
    annual-cycle data supports — flagged here rather than hidden, since it
    does inflate the headline success rate: of 127 records, 110 land
    Improved/Completed Successfully, but a meaningful share of those are
    this "benefit of the doubt" fallback rather than a verified improved
    rating, particularly for anyone whose trigger was a 2025 cycle).
  - Real bug caught mid-build, same class as Phase H's: PowerShell's
    `[array]::IndexOf($hist, $trigger)` throws when `$hist` collapses to a
    scalar (an employee with exactly one performance record) instead of a
    1-element array — fixed by forcing `@($hist)` first. Every one of the
    127 PIP records had silently fallen through to the positive-outcome
    fallback before this fix, since the exception left the "next cycle"
    lookup permanently unset.
  - New page `probation-pip.js`: Probation Reviews/Success Rate/Extended
    KPIs + Outcome breakdown (by department, and a by-hire-year trend);
    PIP Enrollments/3-Month/6-Month Success Rate KPIs + enrollment-by-
    department and both milestone-outcome charts, plus a PIP Records
    detail table. New `probation-pip` section id (auto-appears in Manage
    Access) and one RLS widening: `employee_master`'s sectioned-read policy
    now includes `probation-pip`, same reasoning as every prior widening.
    New "16 — Probation & PIP" Data Refresh card (2 sheets, delete+insert
    like Succession Planning — a full roster snapshot, not an accumulating
    table).
- **Phase J — done** (built 2026-08-16). Employee Satisfaction / eNPS, a
  new module and nav group, synthetic from day one (see `21_enps.sql` and
  `scripts/enps-data/` — same philosophy as Succession Planning/Probation &
  PIP). 2 new tables, matching the phase's own plan:
  - `exit_surveys`: one row per attrition record (588) — an eNPS score
    (0–10, standard NPS scale) read off `termination_reason`, not assigned
    arbitrarily: voluntary/growth-motivated exits score highest
    (Resignation - Better Opportunity → 9), involuntary/disciplinary exits
    score lowest (Termination - Disciplinary → 1). Bucketed the usual NPS
    way (9–10 Promoter, 7–8 Passive, 0–6 Detractor) → 113 Promoters, 250
    Passives, 225 Detractors, eNPS ≈ −19 (a negative eNPS is realistic here,
    not a bug — exit surveys structurally skew negative since only people
    who just left take them).
  - `stage_gate_scores`: 4 rows per employee (Interview/Recruiting/
    Onboarding/Probation — the full 1,510-employee population, 6,040 rows
    total), all 4 derived from the SAME base signal — whether that employee
    was terminated within their own 90-day probation window (the same
    early-termination proxy Phase I's `probation_reviews` uses, reproduced
    directly from `employee_master`/`attrition` here rather than reading
    Phase I's generated CSV, so this generator doesn't depend on Phase I's
    branch having merged first) — with a fixed per-stage offset (Interview
    +1.5, Recruiting +1.0, Onboarding +0.5, Probation +0) modeling the
    well-documented "honeymoon cools toward probation" pattern rather than
    4 independent random draws. Employee Lifecycle Score (avg across all 4
    stages) comes out to ≈8.6 for this roster.
  - New page `enps.js`: eNPS KPI (colored good/warn/bad) + Promoter/
    Passive/Detractor split (the "gauge" from Power BI's report is
    approximated as a KPI card + doughnut, since this app's chart toolkit
    has no literal gauge widget — same "approximate the visual type with
    what's available" approach as every other Power BI-parity page) + eNPS
    trend by exit year + eNPS by department; Employee Lifecycle Score KPI +
    by-stage breakdown + trend by hire year. New `enps` section id
    (auto-appears in Manage Access) and one RLS widening: `employee_master`'s
    sectioned-read policy now includes `enps`. New "18 — Employee
    Satisfaction" Data Refresh card (2 sheets, delete+insert like the other
    Round 2 new-module tables).
- **Phase K — done** (built 2026-08-16). Headcount Forecast, a new module
  and nav group (see `22_headcount_forecast.sql` and
  `scripts/headcount-forecast-data/` — same synthetic-from-day-one
  philosophy as Succession Planning/Probation & PIP/eNPS). One new table,
  `headcount_forecast` — deliberately holds ONLY the forward-looking
  Forecast/Lower-Bound/Upper-Bound series, not an "Actual" scenario too:
  Actual headcount is already perfectly derivable from
  `employee_master.hire_date`/`termination_date` (exactly what
  `headcount.js`'s and `executive.js`'s own live "Headcount Trend" charts
  already compute via `isActiveAsOf`/`monthEnd`), so storing a duplicate
  copy would just be redundant data that could drift out of sync with the
  real population — a deliberate deviation from a literal reading of this
  phase's original one-line plan ("synthetic Actual/Forecast/Lower-Bound/
  Upper-Bound series"), flagged here since it's a design call, not an
  oversight. `generate_headcount_forecast_data.ps1` derives each of the 4
  divisions' (Commercial/Corporate/Operations/Supply Chain) forecast growth
  rate from that division's own real trailing-12-month net change (not a
  random draw — deterministic, like Succession Planning/Probation & PIP/
  eNPS's generators), projected 12 months past this app's fixed "today"
  (2026-08-02, i.e. Sep 2026–Aug 2027), with a confidence band that widens
  from ~1.4% of the forecast at month 1 to ~5.8% at month 12. New page
  `headcount-forecast.js`: 5 KPIs (Current Headcount, Forecasted Headcount
  at 12 months, Projected Net Change, Projected Growth %, Forecast
  Confidence Range), a Headcount Trend chart (Actual solid + Forecast
  dashed + Lower/Upper Bound thin dashed, null-padded so the forecast-side
  lines visually pick up exactly where Actual ends — no `drilldown`, same
  as every other pure time-series trend chart in this app, e.g.
  `ctc-budget-actual.js`'s trend charts), and a Forecasted Headcount by
  Division chart (always broken down by all 4 divisions regardless of the
  page's own Division filter, same "the one dimension a chart groups by
  isn't also narrowed by that same filter" convention `probation-pip.js`'s
  year-trend chart already established) plus a Forecast Detail table. New
  `headcount-forecast` section id (auto-appears in Manage Access) and one
  RLS widening: `employee_master`'s sectioned-read policy now includes
  `headcount-forecast`, needed for the page's own live Current Headcount
  figure. New "19 — Headcount Forecast" Data Refresh card, upserted by
  `(period, division)` — a rolling forecast that gets regenerated
  periodically should only touch the periods/divisions in that upload, same
  reasoning as Payroll's `(employee_id, period)` key, not delete+insert like
  Succession Planning/Probation & PIP/eNPS's point-in-time roster snapshots.
- **Phase L — done** (built 2026-08-16). Executive Insights rollup, the
  last Round 2 phase (see `23_phase_l.sql`). No new tables for the first
  two items — both are read-access widenings onto tables Phase H/J already
  created: **Succession Coverage %** (named-successor positions / total
  critical positions, same definition as `succession.js`'s own KPI) reads
  `critical_positions`/`successors`; **Employee Lifecycle Score** (avg
  across all 4 `stage_gate_scores` rows per employee, same definition as
  `enps.js`'s own KPI) reads `stage_gate_scores`. Both needed `exec`
  section RLS widenings on those 3 tables (`critical_positions`/
  `successors`/`stage_gate_scores`'s own sectioned-read policies, not
  `employee_master`'s — Executive doesn't need employee-level rows from
  either module, just the aggregate counts/averages). **Target lines on
  existing KPIs** turned out to need no new work: Phase G's
  `turnover_rate` targetDelta on Executive's "Attrition Rate (TTM)" already
  covers this — flagged here since the plan's own wording implied more
  might be needed. **Initiatives tracker** (name + status:
  Completed/In Progress/Overdue) is the one genuinely new table, exactly as
  scoped — no dependencies, seeded with 8 invented sample initiatives
  directly by the migration (same "no source workbook, upsert by natural
  key" pattern as `kpi_targets`/`budgeted_positions`), rendered as a plain
  table at the bottom of Executive Insights (no drilldown — there's no
  employee/db-index tie for this table, unlike every other chart on the
  page). New "20 — Initiatives" Data Refresh card, upserted by `name`.

## Tech stack & constraints

- **No Node.js or Python on the dev machine.** Everything is plain HTML/JS/CSS.
  Local testing runs via `serve.ps1` (a zero-dependency PowerShell `HttpListener`
  static file server) — start with:
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "serve.ps1"
  ```
  Serves `app/` at `http://localhost:8843/` by default — but `.claude/launch.json`
  overrides this to **`http://localhost:5173`** in this environment, since 8843
  is an OS-reserved port here. Login: `s.masud@baladna.com` / `Baladna@2026`.
- **No bundler.** Every `<script>` is either a plain global (vendored libs) or
  a native ES module (`app/js/*.js`, loaded via `<script type="module">`).
- **Vendored libraries** in `app/js/vendor/` (all loaded as globals via `<script>`
  tags in `app/index.html`, in this order): `chart.umd.min.js` (Chart.js),
  `xlsx.full.min.js` (SheetJS — used for both Excel export AND reading uploaded
  workbooks), `pptxgen.bundle.js` (PptxGenJS), `supabase.min.js` (Supabase JS
  client v2, global `supabase.createClient`).
- **Excel data source**: `Database/*.xlsx` (14 workbooks) is the original
  authoring format Total Rewards edits monthly/weekly. `PRD/HR_Analytics_Dashboard_Suite_PRD.md`
  is the product spec (converted from the original .docx). `12_Attendance_Violations.xlsx`
  and `14_Payroll_Report.xlsx` are synthetic-only (no real source workbook was
  ever committed for either) — see the Attendance Violations / Payroll Report
  gotchas below for why/how. `13_CTC_Report.xlsx` started life as real,
  unpublished Finance data during development and was resynthesized before
  ever being committed — see the CTC Report gotcha below for how.
- This folder is **OneDrive-synced**. OneDrive AutoSave can silently touch
  `Database/*.xlsx` files (re-serializes the file — calc-chain cache, etc. —
  with zero actual content change) just from Excel opening them, even
  read-only via COM automation. If `git status` shows one of these files
  modified with no reason, diff row counts/first-last rows before assuming
  real data changed (see git history around 2026-08-02 for the exact
  comparison method) — it's usually safe to `git checkout --` the file.

## Architecture

```
app/
  index.html            shell: login screen, sidebar nav, topbar, content area
  css/style.css         brand palette (inspired by agile-hr-analytics.com — deep
                         plum #611F6B + gold accent), dataviz-skill categorical
                         chart palette, light/dark aware
  js/
    supabase-config.js  SUPABASE_URL + SUPABASE_ANON_KEY (public, safe to commit —
                         RLS is what actually restricts access, not this key)
    supabase-client.js  getClient() singleton, used by data.js/auth.js/access.js/
                         admin pages so there's exactly one Supabase client
    auth.js             signIn/signOut/onAuthStateChange wrapper
    access.js            getUserAccess(userId) -> {fullAccess, sections, isAdmin}
                         reads the user_access table
    data.js              loadAll(allowedIds) — fetches only the Supabase tables
                         the user's granted sections need (paginated past
                         PostgREST's 1000-row cap), camelCase<->snake_case
                         conversion, builds employeeIndex/latestBaseSalary/etc.
    charts.js            Chart.js factory (bar/line/doughnut), kpiCard/chartCard/
                         tableCard DOM builders, chartCard's `drilldown` option
                         wires click-to-filter + "Export to Excel" per chart
    export.js            exportRowsToExcel (SheetJS), openDrilldownModal/
                         openPersonDetail (click-a-bar -> see-the-people modal),
                         exportPageToPPTX (whole-tab PPT export)
    app.js               router: hash-based, gates everything behind auth +
                         per-section access (see "Access control model" below),
                         builds nav from allowed sections + admin pages
    zee.js                Zee, the floating chat-assistant widget — mounted once
                         via `initZeeWidget()` in app.js's `main()`, shown/hidden
                         alongside the logged-in app shell (not visible on the
                         login screen). `setPageContext()` is called by app.js's
                         `route()` after every single page render (normal pages
                         and admin pages alike) and re-derives its entire context
                         from the DOM that page just rendered — see the Zee
                         gotcha below for why that's also its whole access-control
                         story.
    pages/
      executive.js, headcount.js, recruitment.js, newhires.js, diversity.js,
      compensation.js, attrition.js, leave.js, performance.js, training.js,
      attendance-violations.js
        — one file per dashboard section. Each exports `meta {id, label,
          subtitle}` and `render({db, contentEl, filtersEl})`. attendance-
          violations.js (id: "attendance") is the odd one out: its two tables
          (excess_hours_violations, article75_violations) aren't joined to
          employee_master at all — see gotcha below.
      nhp.js               "New Hire Program" — one row per participant in the
                           SAME `training` table (training_category: "New
                           Hire Program"), not a separate table or curriculum-
                           item breakdown (Power BI's version tracks per-item
                           detail; this schema has no field for that grain).
                           `meta.section = "training"` — shares the Learning &
                           Training access grant rather than needing its own,
                           since it's the same underlying table.
      underpaid-overpaid.js "Underpaid & Overpaid Analysis" — severity-banded
                           (0–9%/10–19%/20–29%/30–39%/40%+) $ shortfall and
                           excess vs. grade min/max, reusing the exact same
                           `base_salary`/`salary_structure` join Compensation's
                           quartile chart already does. `meta.section =
                           "compensation"` — shares that access grant and
                           needs no `SECTION_TABLES` entry of its own (see the
                           comment at the top of the file for why).
      ctc-budget-actual.js, ctc-expense-category.js, ctc-variance-explorer.js,
      ctc-year-on-year.js
        — the "CTC Report" nav group (4 pages, synthetic financial data — see
          gotcha below). All 4 share ONE access-control grant via
          `meta.section = "ctc"` (see "Access control model" below for why
          that's a separate concept from `meta.id`/routing). Each joins
          `db.ctcActuals`/`db.ctcBudget` rows to Division/Department via
          `db.costCenterIndex.get(row.costCenter)` client-side (no FK, no
          server-side join — same reasoning as employee_master/employeeIndex).
      payroll.js           "Payroll Report" (own nav group, one page — the 4
                           metrics don't need CTC Report's 4-page split).
                           Synthetic monthly Gross Salary/Overtime/Deductions/
                           Air Ticket Cost/Net Pay per employee, joined to
                           Division/Department/Workforce Category via
                           `db.employeeIndex` (DOES have an `employee_id` FK
                           to employee_master, unlike ctc_actuals/cost_center
                           — payroll is employee-level, so it follows
                           base_salary's FK convention instead). See the
                           Payroll Report gotcha below for the generation
                           formulas.
      succession.js         "Succession Planning" (own nav group, one page).
                           Synthetic critical-positions roster (45 positions,
                           step-sampled from active Managerial/Executive
                           employees) joined to its `incumbents`/`successors`
                           rows via `db.criticalPositionsIndex` (keyed by
                           `positionId`, no FK-driven join needed since it's
                           a small in-memory table) and to `db.employeeIndex`
                           for names/departments. Successor rows alias their
                           `successorEmployeeId` to a plain `employeeId`
                           field before being handed to `chartCard`'s
                           `drilldown` — `export.js`'s `openPersonDetail`
                           always looks for `record.employeeId` specifically,
                           so without the alias, clicking a successor in a
                           drilldown list wouldn't merge in their
                           employee_master fields. See the Succession
                           Planning gotcha below for the generator's
                           criticality/vacancy/readiness rules.
      probation-pip.js      "Probation & PIP" (own nav group, one page).
                           Two independent tables (`probation_reviews`
                           covers the full employee population, `pip_records`
                           only the 127 who were ever rated Below
                           Expectations) both joined to `db.employeeIndex`
                           for names/departments, same shape as Attendance
                           Violations' two-table page. Year filter applies
                           each table's own relevant date
                           (`probationStartDate` vs. `pipStartDate`), not a
                           shared date field. See the Probation & PIP
                           gotcha below for how outcomes/milestones are
                           derived from real fields.
      enps.js               "Employee Satisfaction" (own nav group, one
                           page). Two independent tables, both joined to
                           `db.employeeIndex` for names/departments:
                           `exit_surveys` (588 rows, one per attrition
                           record) powers the eNPS KPI/split/trend;
                           `stage_gate_scores` (6,040 rows, 4 per employee)
                           powers the Employee Lifecycle Score KPI/by-stage
                           breakdown/trend. The eNPS "gauge" from Power BI's
                           report is approximated as a KPI card + doughnut
                           (this app's chart toolkit has no literal gauge
                           widget). See the Employee Satisfaction gotcha
                           below for how scores are derived.
      headcount-forecast.js "Headcount Forecast" (own nav group, one page).
                           Reads `db.headcountForecast` (Forecast/Lower/
                           Upper only) directly — no employeeIndex join at
                           all, since it's a division-level aggregate with
                           no per-person drilldown target. The "Current
                           Headcount" figure and the trend chart's
                           historical portion are computed LIVE from
                           `db.employeeMaster` client-side (same
                           `isActiveAsOf`/`monthEnd` pattern
                           `headcount.js`/`executive.js` already use), not
                           read from any stored table — see the Headcount
                           Forecast gotcha below for why.
      admin.js            "Manage Access" — checkbox grid over all users
                           (full_access / is_admin / per-section), auto-saves
                           on change, id: "admin"
      data-refresh.js      "Data Refresh" — upload updated Excel workbooks,
                           parses client-side via SheetJS, preview then full
                           replace (delete+insert) per table, progress bar,
                           writes to data_refresh_log. id: "data-refresh".
                           employee_master, the 4 CTC tables, and payroll are
                           upserted instead of delete+insert (see gotchas
                           below) — the 4 CTC tables are 4 separate upload
                           cards (13a-13d), not one bundled file, since
                           Actuals refreshes monthly but Cost Centers/Budget/
                           Revenue don't. Payroll ("14 — Payroll Report") is
                           its own card too, upserted by (employee_id, period).
                           Succession Planning ("15 — Succession Planning")
                           bundles its 3 sheets into one card (like Attendance
                           Violations' 2), delete+insert — a full roster
                           snapshot, not an accumulating table. Probation &
                           PIP ("16 — Probation & PIP") and Employee
                           Satisfaction ("18 — Employee Satisfaction") each
                           bundle their own 2 sheets the same way.
                           Headcount Forecast ("19 — Headcount Forecast")
                           is upserted by (period, division), like Payroll,
                           not delete+insert. Initiatives ("20 —
                           Initiatives") is upserted by name (its own
                           natural key), same reasoning as KPI Targets'
                           metric_id.
      ctc-converter.js     "CTC Data Converter" (admin-only utility, not a
                           dashboard page) — reshapes Finance's raw monthly
                           Actuals export (GL rows x Cost Center columns) into
                           the long format the "13b — CTC Actuals" card
                           expects, client-side, no Supabase involved. Produces
                           a downloadable file for review before upload —
                           deliberately two steps, not upload-and-go, since a
                           bad reshape would otherwise be easy to miss until
                           it's already live on the dashboard.
scripts/
  ctc-data-extraction/  one-time CTC seed-workbook pipeline — historical, not
                         live (see CTC Report gotcha below for the full story):
                         extract_ctc.ps1 (real source -> CSVs, no longer
                         re-runnable, the real sources aren't in this repo),
                         synthesize_ctc.ps1 (fabricates the $ figures — the
                         one script here that's still meaningful to re-run),
                         build_ctc_workbook.ps1 (CSVs -> Database/13_CTC_Report.xlsx)
  payroll-data/         Payroll Report's one-time synthetic-from-scratch
                         generator (see Payroll Report gotcha below):
                         generate_payroll_data.ps1 (reads employee_master/
                         base_salary/total_rewards CSVs -> payroll.csv,
                         re-runnable but reshuffles all random draws),
                         build_payroll_workbook.ps1 (CSV -> Database/14_Payroll_Report.xlsx)
  succession-data/      Succession Planning's one-time synthetic-from-scratch
                         generator (see Succession Planning gotcha below):
                         generate_succession_data.ps1 (reads employee_master.csv
                         -> critical_positions/incumbents/successors CSVs —
                         deliberately deterministic, no Get-Random, unlike
                         payroll's generator, so re-running reproduces the
                         same 45-position roster instead of reshuffling it),
                         build_succession_workbook.ps1 (CSVs ->
                         Database/15_Succession_Planning.xlsx, 3 sheets)
  probation-pip-data/   Probation & PIP's one-time synthetic-from-scratch
                         generator (see Probation & PIP gotcha below):
                         generate_probation_pip_data.ps1 (reads
                         employee_master.csv/performance.csv ->
                         probation_reviews/pip_records CSVs — deterministic
                         like succession-data's, every outcome derived from
                         a real field, not a dice roll), build_probation_pip_workbook.ps1
                         (CSVs -> Database/16_Probation_PIP.xlsx, 2 sheets)
  enps-data/            Employee Satisfaction / eNPS's one-time synthetic-
                         from-scratch generator (see Employee Satisfaction
                         gotcha below): generate_enps_data.ps1 (reads
                         employee_master.csv/attrition.csv ->
                         exit_surveys/stage_gate_scores CSVs — deterministic
                         like the other Round 2 generators; deliberately
                         re-derives its own early-termination signal from
                         employee_master/attrition rather than reading
                         Phase I's probation_reviews.csv, so this generator
                         doesn't depend on that phase's branch having
                         merged first), build_enps_workbook.ps1 (CSVs ->
                         Database/17_Employee_Satisfaction.xlsx, 2 sheets)
  headcount-forecast-data/ Headcount Forecast's one-time synthetic-from-
                         scratch generator (see Headcount Forecast gotcha
                         below): generate_headcount_forecast_data.ps1 (reads
                         employee_master.csv only -> headcount_forecast.csv
                         — deterministic, no Get-Random; each division's
                         forecast growth rate is that division's own real
                         trailing-12-month net change, not a random draw),
                         build_headcount_forecast_workbook.ps1 (CSV ->
                         Database/18_Headcount_Forecast.xlsx, 1 sheet)
supabase/
  *.sql                 migrations, run manually via Supabase SQL Editor, in
                         NUMBER ORDER (01 through 23 so far — see below)
  csv/                  one-time CSV export used for the original data load
                         (via Table Editor import) — historical, not live
  functions/
    zee-chat/index.ts   Zee's only backend piece — deployed manually via the
                         Supabase Dashboard's Edge Functions editor (no Supabase
                         CLI on this machine, same "do it via the Dashboard"
                         convention as every SQL migration). Verifies the
                         caller's session, wraps the browser-supplied page
                         context in a system prompt, calls the Anthropic
                         Messages API using the `ANTHROPIC_API_KEY` secret
                         (Dashboard-only, never committed). See the Zee gotcha
                         below — this function has NO Supabase table access.
serve.ps1               local static file server (see above)
```

## Access control model

Three independent layers, all enforced at the **database** (RLS), not just UI:

1. **Auth** — Supabase Auth, email/password. No self-signup; accounts are
   created manually via Supabase Dashboard → Authentication → Users. A
   trigger (`handle_new_auth_user`, from `07_admin_panel.sql`) auto-creates a
   matching `user_access` row for every new auth user.
2. **Section access** — `user_access` table: `full_access` (bool, sees
   everything) or `sections` (`text[]` of page ids: `exec`, `headcount`,
   `recruitment`, `newhires`, `diversity`, `compensation`, `attrition`,
   `leave`, `performance`, `training`, `attendance`, `ctc`, `payroll`,
   `succession`, `probation-pip`, `enps`). Each data table has a
   `"sectioned read"` RLS policy scoped to whichever sections legitimately
   read that table client-side (see the table-to-section map hardcoded in
   both `data.js`'s `SECTION_TABLES` and `06_section_based_access.sql`/
   `11_attendance_violations.sql`/`12_ctc_report.sql`/
   `13_newhires_salary_access.sql`/`15_payroll.sql`/`16_phase_d_access.sql`/
   `18_succession_planning.sql`/`19_phase_g.sql`/`20_probation_pip.sql`/
   `21_enps.sql`/`23_phase_l.sql` — keep these in sync if any changes).
   Note: `exec` needs read access to attrition/leave/absenteeism/base_salary/
   critical_positions/successors/stage_gate_scores too, since Executive
   Insights aggregates all of those client-side — granting `exec` is
   broader than it looks. Same reasoning behind why `recruitment`
   reads `employee_master` (Vacancy Rate needs active headcount) and
   `newhires` reads `base_salary`/`salary_structure` (Hires Above Mid % needs
   starting salary vs. grade midpoint) — a page's section grants read access
   to every table its own charts touch, not just the table matching its name.
   `ctc` is the one section shared by more than one page id — `app.js`'s
   `pagesById` is still keyed by unique `meta.id` (routing needs that), but
   access-grant membership is checked via `meta.section || meta.id`, so the
   4 CTC pages (`ctc-budget-actual`, `ctc-expense-category`,
   `ctc-variance-explorer`, `ctc-yoy`) all read `meta.section: "ctc"` and get
   granted/revoked together as one Manage Access checkbox, while every other
   page (no `meta.section` set) keeps the original 1 page = 1 section behavior.
3. **Admin** — `user_access.is_admin` (separate from `full_access` — an
   admin doesn't necessarily see all dashboard data, and a full-access viewer
   isn't necessarily an admin). Gates the "Admin" nav group (Manage Access +
   Data Refresh). Admin-only INSERT/DELETE policies added in
   `09_data_refresh.sql` for the data-refresh feature.

**RLS recursion gotcha**: a policy on `user_access` that subqueries
`user_access` itself to check `is_admin` causes "infinite recursion detected
in policy" — fixed via a `SECURITY DEFINER` helper function `public.is_admin(uid)`
(see `08_fix_admin_recursion.sql`). Any new admin-gated policy should call
`public.is_admin(auth.uid())`, never inline-subquery `user_access`.

## Supabase migrations (run in this order, via SQL Editor)

1. `schema.sql` — the 12 core tables
2. `01_drop_fks.sql` / `02_add_fks.sql` — only needed if import order caused FK errors
3. `03_enable_rls_readonly.sql` — superseded by 04+06, historical
4. `04_add_authenticated_read.sql` — superseded by 06, historical
5. `05_drop_anon_read.sql`
6. `06_section_based_access.sql` — `user_access` table + per-table sectioned policies
7. `07_admin_panel.sql` — `is_admin`, auto-provision trigger, admin read/update policies
8. `08_fix_admin_recursion.sql` — the `is_admin()` SECURITY DEFINER fix (**required**)
9. `09_data_refresh.sql` — `data_refresh_log` + admin insert/delete on all 12 tables
10. `10_employee_master_upsert.sql` — admin UPDATE policy on `employee_master`
    (**required** for the Data Refresh panel's Employee Master upload — see gotcha below)
11. `11_attendance_violations.sql` — `excess_hours_violations` + `article75_violations`
    tables, sectioned read + admin insert/delete policies for the `attendance` section
12. `12_ctc_report.sql` — `cost_centers` + `ctc_actuals` + `ctc_budget` + `ctc_revenue`
    tables for the `ctc` section. All 4 are upserted, not delete+insert — needs
    admin UPDATE as well as insert/delete (see CTC Report gotcha below)
13. `13_newhires_salary_access.sql` — widens `employee_master`'s sectioned-read
    policy to include `recruitment`, and `base_salary`/`salary_structure`'s to
    include `newhires` (**required** for Recruitment's Vacancy Rate and New
    Hires' Hires Above Mid % KPIs — without this, a section-restricted, non-
    full_access recruiter/new-hires user would see those KPIs silently come
    back as 0%/n/a, since RLS would return those tables empty for them)
14. `14_workforce_category.sql` — adds `employee_master.workforce_category`
    (Staff/Labor), backfilled from `job_level`. **Required** for Headcount's
    "Headcount by Employee Type" chart and Leave & Absence's split
    Staff/Labor absenteeism KPIs — until this runs, both silently show 0%
    (no error) since the column doesn't exist yet. No RLS change needed
    (existing `employee_master` policy already covers every section that reads it).
15. `15_payroll.sql` — new `payroll` table (Gross Salary, Overtime, Total
    Deductions, Air Ticket Cost, Net Pay, monthly grain, FK to
    `employee_master`) for the `payroll` section. Upserted by
    `(employee_id, period)`, not delete+insert — needs admin UPDATE as well
    as insert/delete (same reasoning as `ctc_actuals`/`ctc_budget`).
16. `16_phase_d_access.sql` — Power BI Parity Round 2, Phase D: widens
    `performance`'s sectioned-read policy to include `attrition` (High
    Performer Retention % KPI), and `base_salary`'s to include `payroll`
    (Net Salary by Grade chart). **Required** for those two features —
    without this, a section-restricted, non-full_access attrition/payroll
    user sees them silently come back empty, same failure mode as the gap
    `13_newhires_salary_access.sql` fixed.
17. `17_phase_f.sql` — Power BI Parity Round 2, Phase F: `absenteeism.approval_status`,
    a third `workforce_category` value ("Consultant"), `payroll.annual_leave_cost`,
    `training.expiry_date`/`compliance_status`/`required_date`,
    `salary_structure.grade_tier`, and the new `budgeted_positions` table
    (sectioned read for `recruitment`, admin insert/update/delete — same
    pattern as `payroll`/`ctc_actuals`). All backfilled in the same migration;
    no follow-up data load needed except `budgeted_positions`' seed insert,
    which the migration does itself. See CLAUDE.md's Phase F writeup above
    for the per-column reasoning.
18. `18_succession_planning.sql` — Power BI Parity Round 2, Phase H: new
    `critical_positions`/`incumbents`/`successors` tables for the new
    `succession` section (sectioned read, admin insert/update/delete — no
    upsert key, full delete+insert replace like `recruitment`/`diversity`),
    plus widening `employee_master`'s sectioned-read policy to include
    `succession`. `incumbents`/`successors.position_id` are `on delete
    cascade` — **required**, not just tidy: the Data Refresh panel's
    generic multi-sheet replace logic deletes-then-inserts each sheet
    sequentially, so without cascade a re-upload's delete of
    `critical_positions` would hit a foreign-key violation against the OLD
    `incumbents`/`successors` rows still pointing at it. No data to load
    beyond the table creation — see the "15 — Succession Planning" Data
    Refresh card and `scripts/succession-data/` for the synthetic roster.
19. `19_phase_g.sql` — Power BI Parity Round 2, Phase G: new `kpi_targets`
    table (sectioned read for `exec`/`attrition`/`leave`, admin insert/
    update/delete — same pattern as `budgeted_positions`), seeded with 4
    target rows (`turnover_rate`, `retention_rate`,
    `absenteeism_rate_staff`, `absenteeism_rate_labor`) by the migration
    itself. Numbered 19 despite Phase G being the earlier-lettered phase —
    it merged into `main` after Phase H, which had already claimed 18. See
    CLAUDE.md's Phase G writeup above for the target values and the
    `targetDelta()` helper.
20. `20_probation_pip.sql` — Power BI Parity Round 2, Phase I: new
    `probation_reviews`/`pip_records` tables for the new `probation-pip`
    section (sectioned read, admin insert/update/delete — no upsert key,
    full delete+insert replace like Succession Planning's tables), plus
    widening `employee_master`'s sectioned-read policy to include
    `probation-pip`. No data to load beyond the table creation — see the
    "16 — Probation & PIP" Data Refresh card and `scripts/probation-pip-data/`
    for the synthetic roster.
21. `21_enps.sql` — Power BI Parity Round 2, Phase J: new `exit_surveys`/
    `stage_gate_scores` tables for the new `enps` section (sectioned read,
    admin insert/update/delete — no upsert key, full delete+insert replace
    like the other Round 2 new-module tables), plus widening
    `employee_master`'s sectioned-read policy to include `enps`. No data to
    load beyond the table creation — see the "18 — Employee Satisfaction"
    Data Refresh card and `scripts/enps-data/` for the synthetic roster.
    Numbered 21 (not 20, which Phase I's `20_probation_pip.sql` claimed
    first) — both were authored in parallel against the same pre-Phase-I/J
    `main`.
22. `22_headcount_forecast.sql` — Power BI Parity Round 2, Phase K: new
    `headcount_forecast` table for the new `headcount-forecast` section
    (sectioned read, admin insert/update/delete — upserted by
    `(period, division)`, not delete+insert, since it's a rolling forecast
    that gets regenerated periodically rather than a one-off roster
    snapshot), plus widening `employee_master`'s sectioned-read policy to
    include `headcount-forecast` (needed for the page's own live Current
    Headcount figure). No "Actual" data in this table at all — see
    CLAUDE.md's Phase K writeup above for why. See the "19 — Headcount
    Forecast" Data Refresh card and `scripts/headcount-forecast-data/` for
    the synthetic forecast series.
23. `23_phase_l.sql` — Power BI Parity Round 2, Phase L (the last Round 2
    phase): widens `critical_positions`/`successors`/`stage_gate_scores`'
    sectioned-read policies to include `exec` (Executive's new Succession
    Coverage % and Employee Lifecycle Score KPIs read those 3 tables
    directly — no `employee_master` widening needed this time, since
    Executive only needs the aggregate counts/averages, not employee-level
    rows). Also creates the new `initiatives` table (sectioned read for
    `exec` only, admin insert/update/delete, upserted by `name`), seeded
    with 8 invented sample rows by the migration itself. See CLAUDE.md's
    Phase L writeup above for why "target lines on existing KPIs" needed no
    further work.

`check_row_counts.sql` / `diagnose_user_access.sql` are diagnostic scripts, not migrations.

## Deployment workflow

GitHub (`smasudsm-a11y/BaladnaHRDashboardV1`) → Render Static Site (auto-deploys
on push to `main`, publish dir `app`, no build command) → Supabase (data +
auth backend). Live at https://baladnahranalytics.onrender.com.

Standard flow for a change: create a `feature/*` branch → commit → push →
give the user the GitHub PR-creation link → **user merges via GitHub's web UI**
(no `gh` CLI on this machine) → `git checkout main && git pull origin main`
locally → verify on Render.

## Test accounts (Supabase Auth)

- `s.masud@baladna.com` — full_access + is_admin, password `Baladna@2026`
- `recruiter-test@baladna.com` — sections: recruitment, newhires, diversity
  (added incrementally while testing), password `test@123`

## Known gotchas

- **`employee_master.job_level` and `employee_master.workforce_category` both
  have a value literally called `"Staff"`, meaning two unrelated things** —
  `job_level` is the org-hierarchy tier (Staff/Supervisory/Managerial/Executive,
  used by e.g. `headcount.js`'s "Headcount by Organisation Level"); `workforce_category`
  is white-collar-vs-blue-collar (Staff/Labor, added in `14_workforce_category.sql`,
  used by "Headcount by Employee Type" and Leave's split absenteeism KPIs). An
  individual-contributor `job_level: "Staff"` row is very often
  `workforce_category: "Labor"` — the two "Staff"s do not imply each other.
- **"Auth session missing!" / getUser() returns null**: session expired or got
  invalidated by refresh-token rotation (common when many browser tabs share
  the same origin's localStorage and refresh concurrently during heavy
  testing). Fix: log in again. Not a code bug.
- **PostgREST caps a single SELECT at 1000 rows** — `data.js`'s `fetchAllRows`
  pages through via `.range()`. Any new direct Supabase query elsewhere must
  do the same for tables that can exceed 1000 rows (absenteeism, leave,
  training, base_salary, total_rewards).
- **Data refresh is not transactional** — each table's delete+insert is
  separate REST calls, not one DB transaction. A failure partway through a
  multi-table upload (e.g. Compensation's 3 tables) can leave one table
  cleared without its replacement. Documented as a known trade-off; would
  need a server-side Postgres function to make atomic.
- **employee_master is upserted, not delete+insert** — 9 other tables
  (org_hierarchy, diversity, attrition, base_salary, total_rewards, leave,
  absenteeism, performance, training) FK-reference `employee_master.employee_id`,
  so clearing this table would violate those constraints the moment any of
  them has data. Its Data Refresh upload does `upsert(rows, {onConflict:
  "employee_id"})` instead — needs the admin UPDATE policy from
  `10_employee_master_upsert.sql`, since upsert's ON CONFLICT DO UPDATE branch
  requires it (the admin insert/delete policies from `09_data_refresh.sql`
  aren't enough). Trade-off: employee rows removed from the uploaded file are
  left in the DB, not deleted — other tables' history may still reference them.
- **Attendance Violations is a separate employee population, not joined to
  employee_master** — sourced from a real weekly "Attendance Violation Report"
  (deck + workbook, outside this repo) covering ~1,769 operational/biometric-
  tracked staff (Farms, Warehouses, Fleet, Retail field staff, etc.) — a
  different HRIS process from the ~922-person corporate `employee_master`
  population the rest of this dashboard is built on (different headcount,
  different department taxonomy, no overlapping employee IDs). Both tables
  are self-contained (employee name/dept/job baked into each row, like the
  source report's own per-instance detail) — no `employeeId` FK, no join
  through `db.employeeIndex`. `article75_violations` is weekly-count-only
  by design: the source report never tracks individual Article 75 cases,
  only a count, so there's no per-case detail to drill into (its chart card
  uses `tableColumns`/`tableRows` instead of `drilldown`). The ~12 months of
  historical data in `12_Attendance_Violations.xlsx` was synthesized to match
  the real report's own weekly instance/employee/case-count trend (extracted
  from the deck's embedded chart XML) — including its Jan–Apr spike — with
  entirely fictional identities, not the real report's names/IDs.
- **CTC Report (`Database/13_CTC_Report.xlsx`) started as real company
  financial data and was resynthesized before commit** — same reasoning as
  Attendance Violations: the dashboard was built and validated against real
  numbers first (see reconciliation notes below — the real source was
  `CTC/2024 Actual/*.xlsx`, 30 real monthly GL x Cost Center workbooks, Jan
  2024–Jun 2026; `CTC/2024 Revenue/2024 Revenue.xlsx`, real company-wide
  revenue, Jan 2024–Dec 2026; and a Cost Center → Division/Department mapping
  from a separate Finance working file, `Monthly CTC Dashboard 2026/APR-06/
  Apr 2026 CTC ppt workings.xlsx`, sheet "CC Comparison" — all outside this
  repo, all real, none of it ever committed), then every dollar figure was
  replaced with fabricated values before anything went to git.
  **Resynthesis method** (`scripts/ctc-data-extraction/synthesize_ctc.ps1`,
  run once): each Cost Center gets its own random multiplier in [0.65, 1.45]
  — drawn independently for `ctc_actuals.csv` vs. `ctc_budget.csv`, so Budget
  isn't just a rescaled copy of Actual — plus small per-row jitter (±6%) so
  month-to-month shape isn't a pure linear rescale of the real trend either.
  `ctc_revenue.csv` gets one multiplier for its Actual series and another for
  Budget, same reasoning. Cost Centers Data (the CC → Division/Department
  mapping) is untouched — no dollar figures in it, and it needed to stay
  correct for the Power BI reconciliation below to mean anything. Real CSVs
  were backed up outside the repo before running the transform, and the real
  source workbooks under `/CTC/` remain gitignored regardless — this
  resynthesis only affects what's downstream of them.
  Data-quality decisions made while building and reconciling the *real*
  seed workbook, before resynthesis (kept here since the structure — which
  cost center maps to which division, which GL line is excluded, etc. —
  carried forward unchanged into the synthetic version; reproducible against
  the real Division-level totals in `Monthly CTC Dashboard 2026/CTC
  Summary.xlsx`, which is what the original Power BI report itself was built
  from, if the real source files are ever available again):
  - **Granular Budget (GL x Cost Center, monthly) only exists for 2026** — the
    "Detailed Budget" sheet in the workings file above has no 2024/2025
    equivalent at that grain, only company-wide monthly totals. Budget-side
    breakdowns are correctly empty for 2024/2025 rather than backfilled/guessed.
  - **3 cost centers (COM-103, COF-108, COM-130) don't appear in any mapping
    sheet found** — reconciliation proved they're Commercial (Commercial's
    mapped total + these three = the real Commercial figure to the penny), so
    Division is set to Commercial for all 3; Department is `"Unclassified"`
    since that part couldn't be confirmed.
  - **"Shared expenses (Employee Cost)" GL line is excluded from ctc_budget
    entirely** — it's an overhead allocation, not part of Finance's own CTC
    definition (confirmed: including it overstated every known month's Budget
    CTC by ~exactly this line's amount vs. `CTC Summary.xlsx`'s totals).
  - **FS Category is hardcoded to `"Employee Cost"`** rather than read from
    the source files' own FS Category column — every row in this extract is
    Employee Cost by definition, and at least one real monthly file (`Apr
    2024.xlsx`) has a data-entry glitch duplicating GL Name into that column.
    The CTC Data Converter applies the same hardcoding for the same reason.
  - Company-wide monthly totals reconcile to ~0.01% against `CTC Summary.xlsx`.
  - **`ctc_budget.csv`'s real predecessor was re-extracted once, after the
    initial build** — the first pass used the "Detailed Budget" sheet inside
    `Apr 2026 CTC ppt workings.xlsx`, which turned out to be stale (its
    division-level splits diverged from the real Power BI report by up to
    ~20% for some divisions, even though the company-wide total looked "close
    enough"). The corrected source was the "Detailed Budget (Q4 Phasing)"
    sheet in `Monthly CTC Dashboard 2026/May-06/May 2026 Forecast.xlsx` (GL x
    Cost Center x Month, full Jan–Dec 2026, cross-validated identical in a
    second file, `Employee Cost July 2026 Analysis.xlsx`) — reconciled to the
    real Power BI screenshots to the dollar for every division and month
    checked, **except Farms/Finance in Feb and Mar specifically** (~0.1% off,
    both months, opposite sign, suggesting one manual reallocation on Power
    BI's side that isn't reflected in either "Detailed Budget" source) — left
    as-is, same "not chased further" call as the rest of this list. Unlike the
    first pass, this corrected source's "Shared expenses (Employee Cost)" GL
    line needed to stay **included**, not excluded — that exclusion rule
    only corrected for the *first*, stale source's over-count; applying it to
    the corrected source would reintroduce a ~120k QAR/month undercount.
  - `ctc_actuals`/`ctc_budget` are upserted on a composite key
    (`period, gl_code, cost_center`), not delete+insert, same reasoning as
    employee_master: each monthly upload should only touch that month's rows.
    `data-refresh.js`'s `upsertKey` already supported a comma-separated
    composite string being passed straight to PostgREST's `onConflict` with
    no code changes needed — only the DB-side unique constraint had to exist.
  - **3 pages default their Year filter to 2026, not "All"** (`ctc-budget-actual.js`,
    `ctc-expense-category.js`, `ctc-variance-explorer.js`) — Budget only
    exists for 2026, so "All" would compare a 2026-only Budget total against
    a 2024–2026 Actual total, producing a nonsensical Diff. `ctc-year-on-year.js`
    doesn't need this (one scenario — Actual or Budget — at a time, never both).
  - **`ctc-year-on-year.js`'s Year-over-Year % compares the same N months in
    both years**, not this-year-to-date vs. last year's full year — otherwise
    a partial current year always looks like a huge decline purely from
    having fewer months of data than the prior full year.
  - **Extraction/build scripts live in `scripts/ctc-data-extraction/`**
    (`extract_ctc.ps1` reads the source files into CSVs, `build_ctc_workbook.ps1`
    writes `Database/13_CTC_Report.xlsx` from those CSVs) — this was a one-time
    historical backfill; the CTC Data Converter handles ongoing monthly
    uploads without needing these scripts again. Two real bugs hit while
    writing `build_ctc_workbook.ps1`, worth knowing if it's ever rerun/edited:
    - **PowerShell multi-dim array indexer**: `$arr[$r+1,$c]` silently
      mis-parses (throws "System.Object[] does not contain a method named
      'op_Addition'") — must parenthesize: `$arr[($r+1),$c]`.
    - **PowerShell array truthiness**: `if ($textColumns)` where
      `$textColumns = @(0)` evaluates **false**, because a single-element
      array unwraps to its scalar (`0`, falsy) for boolean tests. Use
      `if ($null -ne $textColumns)` instead of truthiness-testing an array
      that might legitimately contain a single `0`.
    - **Period column must be written as Text (`NumberFormat = "@"`) before
      assignment, not after** — otherwise Excel auto-converts the "2024-04-01"
      -style string to a date serial on write, and reading it back via
      SheetJS's `cellDates:true` in this environment (Asia/Qatar, browser
      Date-object local-getter round-trip through SheetJS's date-object
      construction) shifts it back one day. Writing it as literal text
      sidesteps the whole date-object path — `toIsoDate()`'s plain-string
      fallback returns it completely unchanged. If you ever see a CTC period
      off by one day, this is almost certainly why.
- **Payroll Report (`Database/14_Payroll_Report.xlsx`) is synthetic from day
  one** — no real payroll source ever existed to reconcile against here,
  same philosophy as Attendance Violations/New Hire Program, not the CTC
  Report module's real-data-then-resynthesize approach. Generated by
  `scripts/payroll-data/generate_payroll_data.ps1` (CSV out, reads
  `supabase/csv/employee_master.csv`/`base_salary.csv`/`total_rewards.csv` —
  no live Supabase access needed to regenerate) then
  `build_payroll_workbook.ps1` (CSV → workbook, reusing `build_ctc_workbook.ps1`'s
  `Write-SheetFromRows` helper verbatim, including its two gotchas: the
  parenthesized multi-dim indexer `$arr[($r+1),$c]`, and writing the Period
  column as Text (`NumberFormat = "@"`) *before* assignment to dodge the same
  one-day-shift-on-read-back bug documented under CTC Report above).
  One row per employee per **active** calendar month (gated by
  `hire_date`/`termination_date`, not a flat month count per employee),
  **Jan 2024 through Jun 2026** — deliberately matching `ctc_actuals`'
  existing upper bound rather than inventing a new one, so every monthly-grain
  financial module in this app sits on the same timeline. Per-employee/month
  formulas (all fabricated, none reconciled against anything real):
  - `gross_salary` = that employee's `base_salary` + `total_rewards`
    allowances (housing+transport+education+other), using whichever
    `salary_effective_date` row applies as of that month (latest effective
    date `<=` the period, per employee), × ±2% monthly jitter.
  - `overtime_amount` is tied to `workforce_category` (the Staff/Labor split
    from `14_workforce_category.sql`, recomputed independently in PowerShell
    from `job_level` since that migration's backfill isn't reflected in the
    static CSV) — Labor gets a nonzero draw ~40% of months (500-3000 QAR),
    Staff ~5% of months (200-800 QAR). A deliberate use of a distinction this
    app already tracks, not an arbitrary split.
  - `total_deductions` = `gross_salary` × random 1-4% every month, plus an
    occasional (~10% of months) extra 5-10%-of-gross "loan deduction" spike.
  - `air_ticket_cost`: expat employees (`nationality != "Qatari"`) get
    exactly one nonzero month per year — their hire-anniversary month, so
    it's deterministic per employee, not fully random — 1500-4000 QAR;
    Qatari nationals always 0 (matches the real-world practice this line
    item represents: an annual home-leave ticket allowance for expats only).
  - `net_pay` = `gross_salary + overtime_amount - total_deductions`.
    `air_ticket_cost` is a separate employer cost line, **not** netted into
    pay — matches how Power BI treats it as its own KPI, not a payslip
    deduction/addition.
  Seeded into Supabase the same way every other table is: no one-off seed
  script, just the "14 — Payroll Report" Data Refresh card once the
  migration and workbook both exist.
- **Succession Planning (`Database/15_Succession_Planning.xlsx`) is
  synthetic from day one** — same philosophy as Payroll/Attendance
  Violations, not the CTC Report module's real-data-then-resynthesize
  approach. Generated by `scripts/succession-data/generate_succession_data.ps1`
  (reads `supabase/csv/employee_master.csv` only — no live Supabase access
  needed) then `build_succession_workbook.ps1` (CSVs → 3-sheet workbook,
  reusing `build_ctc_workbook.ps1`'s `Write-SheetFromRows` helper verbatim).
  Unlike every other synthetic-data script in this app, this one is
  **deliberately deterministic** (no `Get-Random` anywhere) — a succession
  roster reads better as a stable, explainable selection than as reshuffled
  dice rolls, so re-running it reproduces the exact same 45 positions.
  - **Critical positions**: step-sampled from the 174 active
    Managerial/Executive employees down to 45, spread across all 13
    departments by construction (sampled in `employee_id` order at a fixed
    stride, not grouped by department first). `criticality` is read off the
    position_title text itself — "Chief Officer"/"Head of Department" →
    Critical, "Senior Manager" → High, else Medium — a deterministic,
    explainable rule rather than an arbitrary label.
  - **Incumbents**: every 7th sampled position (~14%) is left vacant on
    purpose (`employee_id` null, no `time_in_role_years`/`retirement_risk`) —
    a real succession plan always has some open critical seats.
    `retirement_risk` is age-banded (55+ High, 45–54 Medium, else Low) — age
    is the only field in this schema close to a real retirement-risk signal.
  - **Successors**: coverage deliberately varies 0/1/2/1 per position in a
    fixed rotation, so ~1 in 4 positions has NO named successor (a genuine,
    visible succession gap — 100% coverage wouldn't read as a believable
    roster). Candidates are drawn from active Supervisory/Managerial
    employees in the SAME department as the position, excluding the
    incumbent. `readiness` is banded off the candidate's own tenure (3+ yrs
    → Ready Now, 1.5–3 → Ready 1-2 Years, 0.5–1.5 → Ready 3-5 Years, else Not
    Ready). The 1st successor (when any are named) is always the
    longest-tenured candidate in the pool — a defensible "top pick" rule,
    and also the one flagged `is_high_potential`. The 2nd successor (only
    named when a position gets 2) is deliberately **not** the 2nd-longest-
    tenured candidate — that flattened almost every pick into "Ready Now,"
    since this department's Supervisory/Managerial tenure skews long. It's
    instead drawn from a rotating depth into the rest of the pool (30/55/80/
    95% of the way down, cycling by position index), which is what actually
    produces a spread across the Readiness bands in the final dataset (34
    Ready Now, 9 Ready 1-2 Years, 2 Ready 3-5 Years, out of 45 total —
    "Not Ready" never comes up in this particular roster, which is fine).
  - `incumbents.position_id`/`successors.position_id` are `on delete
    cascade` (see `18_succession_planning.sql`) — **not just tidy, required**
    for the Data Refresh card to survive a second upload: see the migration's
    own comment and the note under migration 18 above for why.
  - Seeded into Supabase the same way as Payroll: no one-off seed script,
    just the "15 — Succession Planning" Data Refresh card once the migration
    and workbook both exist.
- **Probation & PIP (`Database/16_Probation_PIP.xlsx`) is synthetic from
  day one** — same philosophy as Succession Planning. Generated by
  `scripts/probation-pip-data/generate_probation_pip_data.ps1` (reads
  `employee_master.csv`/`performance.csv` only) then
  `build_probation_pip_workbook.ps1` (CSVs → 2-sheet workbook, reusing
  `build_ctc_workbook.ps1`'s `Write-SheetFromRows` helper verbatim,
  including its Text-format-before-assignment date gotcha for
  `ProbationStartDate`/`ReviewDate`/`PIPStartDate`). Deterministic, like
  Succession Planning's generator — every outcome below comes from a real
  field, not a random draw.
  - **Probation reviews** cover the full 1,510-employee population (unlike
    Succession Planning's curated 45-position sample) — review date = hire
    date + 90 days. Outcome: terminated within that window → Not Confirmed
    (22, 1.5%); not terminated early but their earliest recorded
    performance rating was Below Expectations → Extended (47, 3.1%);
    otherwise → Confirmed (1,441, 95.4%).
  - **PIP records** cover only the 127 employees whose most recent
    recorded performance rating was Below Expectations (out of ~1,235 with
    any performance history at all — performance.csv only has 2023/2024/
    2025 Annual cycles, so "most recent" means their latest cycle, not
    necessarily 2025's). `pip_start_date` = that review's date + 3 weeks.
    Both milestones (`month3_status`, `month6_status`) are derived from
    whichever real signal follows: a later annual cycle's rating (improved
    → 3-month Improved/6-month Completed Successfully; still Below
    Expectations → both Not Improved), or an early termination (within 90
    days of PIP start → both Terminated; within 180 days → 3-month Not
    Improved/6-month Terminated). **If no later cycle exists at all**
    (their trigger was already their most recent recorded cycle — true for
    every 2025-triggered PIP, since there's no 2026 performance data yet)
    **and no qualifying termination**, both milestones default to a
    positive outcome — the only fallback this annual-cycle data supports.
    This is flagged here rather than hidden because it does inflate the
    headline numbers: of 127 PIP records, 110 land Improved/Completed
    Successfully, but a real share of those are this benefit-of-the-doubt
    fallback rather than a verified improved rating. If this ever needs a
    more conservative story, the fix is either extending performance.csv's
    cycle range or having the fallback resolve to something less generous.
  - **Real bug caught mid-build**, same class as a PowerShell gotcha
    documented elsewhere in this file: `[array]::IndexOf($hist, $trigger)`
    throws when `$hist` (an employee's performance-cycle history) collapses
    to a bare scalar instead of a 1-element array — which PowerShell does
    whenever a collection literally has one item. Every one of the 127 PIP
    records had silently fallen through to the positive-outcome fallback
    before this was caught and fixed by forcing `@($hist)` first — the
    thrown exception left the "next cycle" lookup variable permanently
    unset, and PowerShell's default non-terminating error handling let the
    loop carry on regardless. Re-run and re-check the outcome distribution
    (`Group-Object Month3Status`/`Month6Status`) after touching this script,
    since a regression here wouldn't throw a visible top-level error.
  - Seeded into Supabase the same way as Succession Planning: no one-off
    seed script, just the "16 — Probation & PIP" Data Refresh card once the
    migration and workbook both exist.
- **Employee Satisfaction / eNPS (`Database/17_Employee_Satisfaction.xlsx`)
  is synthetic from day one** — same philosophy as Succession Planning.
  Generated by `scripts/enps-data/generate_enps_data.ps1` (reads
  `employee_master.csv`/`attrition.csv` only) then `build_enps_workbook.ps1`
  (CSVs → 2-sheet workbook, reusing `build_ctc_workbook.ps1`'s
  `Write-SheetFromRows` helper verbatim). Deterministic, like the other
  Round 2 generators — every score comes from a real field.
  - **Exit surveys** cover every attrition record (588) — eNPS score (0–10)
    read off `termination_reason`: voluntary/growth-motivated exits score
    highest (Resignation - Better Opportunity → 9), involuntary/
    disciplinary exits lowest (Termination - Disciplinary → 1). Bucketed
    the standard NPS way (9–10 Promoter, 7–8 Passive, 0–6 Detractor) →
    113/250/225, eNPS ≈ −19. **A negative eNPS here is realistic, not a
    bug** — exit surveys are inherently a skewed sample (only people who
    just left take them), so a negative score doesn't imply the whole
    active workforce feels that way; it's a known, expected property of
    exit-survey-based eNPS specifically.
  - **Stage-gate scores** cover the full 1,510-employee population, 4 rows
    each (6,040 total: Interview/Recruiting/Onboarding/Probation). All 4
    are derived from the SAME base signal per employee — whether they were
    terminated within their own 90-day probation window — with a fixed
    per-stage offset (+1.5/+1.0/+0.5/+0) modeling early-lifecycle sentiment
    cooling toward probation, a real documented HR pattern, rather than 4
    independent random draws. **Deliberately does NOT read Phase I's
    `probation_reviews.csv`**, even though it's computing conceptually the
    same early-termination signal Phase I's `Outcome` column already
    captures — this generator re-derives it directly from
    `employee_master`/`attrition` instead, specifically so it has no
    dependency on Phase I's branch/script having been run first (Phase I
    and Phase J were built in separate parallel sessions with no
    guaranteed merge order — see the note under migration 20 above). If
    the two ever need to agree exactly, this is the one place to check
    first for drift.
  - Employee Lifecycle Score (this roster's avg across all 4 stages) comes
    out to ≈8.6 — a positive number, consistent with ~95% of employees
    passing probation cleanly (see Phase I's own `probation_reviews`
    outcome distribution, which this generator's simpler version
    approximates).
  - Seeded into Supabase the same way as Succession Planning: no one-off
    seed script, just the "18 — Employee Satisfaction" Data Refresh card
    once the migration and workbook both exist.
- **Headcount Forecast (`Database/18_Headcount_Forecast.xlsx`) is
  synthetic from day one, but ONLY on the Forecast/Lower/Upper side** —
  unlike every other Round 2 module, its stored table deliberately has NO
  "Actual" data at all. Actual headcount is already perfectly derivable
  from `employee_master.hire_date`/`termination_date` (that's exactly what
  `headcount.js`'s and `executive.js`'s own live "Headcount Trend" charts
  already compute client-side via `isActiveAsOf`/`monthEnd`), so this
  module reuses that same live computation for its "Current Headcount" KPI
  and the historical portion of its trend chart, rather than storing a
  second, potentially-drifting copy of a number the app can already compute
  for free. Generated by
  `scripts/headcount-forecast-data/generate_headcount_forecast_data.ps1`
  (reads `employee_master.csv` only) then
  `build_headcount_forecast_workbook.ps1` (CSV → 1-sheet workbook, reusing
  `build_ctc_workbook.ps1`'s `Write-SheetFromRows` helper verbatim,
  including its Text-format-before-assignment date gotcha for the `Period`
  column). Deterministic, like the other Round 2 generators.
  - **Forecast growth rate per division is that division's own real
    trailing-12-month net change** (Commercial +0.5/mo, Corporate −0.75/mo,
    Operations −1.08/mo, Supply Chain −0.58/mo, as of this app's fixed
    "today," 2026-08-02) — not a random draw. Projected forward 12 months
    (Sep 2026–Aug 2027), rounded, floored at 0.
  - **Confidence band widens with horizon**: ~1.4% of the forecast value at
    month 1 up to ~5.8% at month 12 (minimum ±2, so a division near-zero
    headcount still gets a visible band) — the standard "further out = less
    certain" shape, not a fixed-width band.
  - **The page's live "Current Headcount" figure and the trend chart's
    last historical point deliberately use the SAME cutoff the generator
    script used as its own baseline** — `isActiveAsOf(e, monthEnd(ym))` for
    the current calendar month, not `employmentStatus === "Active"` (which
    is what `headcount.js`'s own KPI card uses for its literal "right now"
    snapshot). Using the KPI-card version here instead would create a
    small, silent mismatch between the chart's Actual/Forecast bridging
    point and the CSV's own baseline — worth checking first if this page's
    trend line ever looks like it "jumps" at the boundary.
  - Seeded into Supabase the same way as the other Round 2 modules: no
    one-off seed script, just the "19 — Headcount Forecast" Data Refresh
    card once the migration and workbook both exist.
- **Zee (`app/js/zee.js` + `supabase/functions/zee-chat/index.ts`) has ZERO
  database access by design** — this is deliberate, not an oversight, and is
  what makes "Zee won't answer about modules you don't have access to" true
  by construction rather than by a permission check that could have a bug.
  The Edge Function only ever sees whatever `contextText` the browser sends
  it (a plain-text dump of the KPI cards/charts/tables already rendered on
  the CURRENT page, built by `zee.js`'s `buildPageContext()` purely from the
  DOM) plus the user's question — it has no Supabase client wired to any HR
  table, so there is no code path for it to go fetch anything else even if
  asked to. `app.js`'s router already refuses to render any page outside a
  user's `allowedIds`, so restricting Zee to "whatever's on screen right
  now" automatically inherits that access control — do not "improve" this by
  giving the Edge Function its own Supabase table access; that would defeat
  the design. `setPageContext()` resets the conversation history on every
  page change (Zee shouldn't carry Compensation-page context into a
  Payroll-page conversation).
  Requires one manual, one-time setup step outside this repo: create the
  function via the Supabase Dashboard's Edge Functions editor (no Supabase
  CLI on this machine) and set the `ANTHROPIC_API_KEY` secret there — the
  user's own Anthropic API key, billed to their own account, and never
  committed anywhere in this repo. If Zee responds with "Zee isn't
  configured yet," that secret is missing or the function isn't deployed.
  **The deployed function's actual name is `quick-handler`, not `zee-chat`**
  — it was created under that name by mistake and Supabase doesn't support
  renaming a function after creation, so `app/js/zee.js`'s `FUNCTION_URL`
  points at `/functions/v1/quick-handler` instead of matching the source
  file's own path (`supabase/functions/zee-chat/index.ts`). If Zee is ever
  redeployed under its intended name, update that URL back to `zee-chat`.
  No new migration/RLS needed — Zee doesn't touch `user_access` or any
  section id at all.
  Explicitly out of scope for the first pass (flagged, not silently
  dropped): chat history isn't persisted anywhere (session-only, resets on
  page change/reload — no `zee_chat_log` table), and there's no server-side
  rate limiting on Anthropic usage (a client-side-only cap would be trivial
  to bypass, so it wouldn't be real protection — a proper one needs a
  per-user counter checked inside the Edge Function, not built here since
  Anthropic billing is pay-per-token and this is a company-wide app).
- Browser testing in this environment: the sandboxed browser pane doesn't
  reliably composite frames for screenshots/pixel-coordinate clicks (0×0
  viewport). Verify chart click-to-drill by mocking `chart.getElementsAtEventForMode`
  on the real `Chart.getChart(canvas)` instance rather than dispatching
  synthetic mouse coordinates.

## Build history (chronological, for context on *why*)

1. Dashboard built from static JSON (Excel → PowerShell/Excel-COM export)
2. Restyled to agile-hr-analytics.com-inspired brand palette
3. Added PPT export, per-chart Excel export, click-to-drill detail modals
4. Migrated data source from static JSON to live Supabase (paginated fetch)
5. Added Supabase Auth login screen
6. Added per-section database-enforced access control
7. Added in-dashboard Admin panel for managing user access (checkboxes)
8. Added Excel-to-Supabase Data Refresh panel with upload history log
9. Fixed Employee Master refresh to upsert instead of delete+insert (FK conflicts)
10. Added Attendance Violations module (Excess Hours + Article 75), a separate
    operational-workforce population synthesized from a real weekly report
11. Added CTC Report module (Budget vs Actual CTC, CTC by Expense Category,
    CTC Variance Explorer, CTC Year on Year), built and reconciled against
    real Finance data first; added the CTC Data Converter admin utility and
    the `meta.section` mechanism so multiple pages can share one access grant
12. Rebuilt the CTC Breakdown table as a Division/Department/Cost Center x
    Month matrix (collapsible rows, like the source Power BI visual);
    corrected `ctc_budget`'s source after the real-data reconciliation
    surfaced division-level mismatches; resynthesized all 4 CTC tables'
    dollar figures and committed the module for the first time
13. Closed most of the gap against Power International Holding's Group-wide
    Power BI suite (Baladna-scoped): Legal Entity/Localization, salary
    positioning by quartile, Pre/Post-Calibration ratings, Retention Rate,
    Vacancy Rate, Hires Above Mid %, Workforce Tenure Distribution, a
    Staff/Labor `workforce_category` split, and a New Hire Program page
14. Added the Payroll Report module (own nav group): monthly Gross Salary,
    Overtime, Deductions, Air Ticket Cost, and Net Pay per employee,
    synthetic from day one — the last deferred item from the Power BI-parity
    project, which this closes out entirely
15. Added Zee, a floating AI chat-assistant widget that answers questions
    about whatever's currently on screen, backed by a new `zee-chat`
    Supabase Edge Function (first use of Edge Functions in this project) that
    proxies to the Anthropic API — designed with zero database access so its
    access control is structural (only ever sees the current page's own
    rendered data) rather than a permission check that could have a bug
16. Started Power BI Parity Round 2 (a real page-by-page code+schema audit,
    after Round 1's "complete" call turned out to be premature): Phase D
    (quick-win charts/KPIs across Headcount, Payroll, Leave & Absence,
    Training, Performance, Attrition — no new tables, two RLS widenings),
    Phase E (Underpaid & Overpaid Analysis, a new page reusing Compensation's
    existing base_salary/salary_structure join, no new tables or access
    grants), out of order ahead of Phase E but landed the same day (built in
    a parallel session) Phase F (modest schema additions — `approval_status`,
    a 3rd `workforce_category` value, `annual_leave_cost`, training expiry/
    compliance tracking, NHP's Required Date, `grade_tier`, and the new
    `budgeted_positions` table), Phase G (a small `kpi_targets` table
    surfacing a target/delta line on Attrition, Executive, and Leave &
    Absence's rate KPIs), Phase H (Succession Planning, a new module and
    nav group — `critical_positions`/`incumbents`/`successors`, synthetic
    from day one — G and H were both built in their own parallel sessions
    and merged in sequence, H first, hence G's migration landing on 19
    instead of 18), Phase I (Probation & PIP, a new module and nav group —
    `probation_reviews`/`pip_records`, synthetic from day one), and Phase J
    (Employee Satisfaction/eNPS, a new module and nav group —
    `exit_surveys`/`stage_gate_scores`, synthetic from day one, eNPS
    derived from real termination reasons and Employee Lifecycle Score from
    a reproduced early-termination signal so it has no dependency on Phase
    I's branch — I and J were likewise both built in their own parallel
    sessions and merged in sequence, I first, hence J's migration landing
    on 21 instead of 20), Phase K (Headcount Forecast, a new module and
    nav group — one new table, `headcount_forecast`, holding only the
    forward-looking Forecast/Lower/Upper series since Actual headcount is
    already computable live from `employee_master`; each division's
    forecast growth rate is that division's own real trailing-12-month net
    change, not a random draw), and Phase L (Executive Insights rollup, the
    last Round 2 phase — Succession Coverage % and Employee Lifecycle Score
    added to Executive via read-access widenings onto Phase H/J's existing
    tables, no new tables for either; a small new `initiatives` table for
    the Initiatives tracker, the only genuinely new table this phase
    needed) — see "Power BI Parity — Round 2" above. Round 2 is now
    complete.
