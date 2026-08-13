# Baladna HR Analytics Dashboard Suite

A static HTML/CSS/JS dashboard (no build step, no framework) reading live from
Supabase, deployed as a Render Static Site. Built incrementally — see "Build
history" below for what exists and in what order it was added.

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
- **Excel data source**: `Database/*.xlsx` (13 workbooks) is the original
  authoring format Total Rewards edits monthly/weekly. `PRD/HR_Analytics_Dashboard_Suite_PRD.md`
  is the product spec (converted from the original .docx). `12_Attendance_Violations.xlsx`
  is synthetic-only (no real source workbook was ever committed) — see the
  Attendance Violations gotcha below for why it's a separate population.
  `13_CTC_Report.xlsx` started life as real, unpublished Finance data during
  development and was resynthesized before ever being committed — see the
  CTC Report gotcha below for how.
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
      ctc-budget-actual.js, ctc-expense-category.js, ctc-variance-explorer.js,
      ctc-year-on-year.js
        — the "CTC Report" nav group (4 pages, synthetic financial data — see
          gotcha below). All 4 share ONE access-control grant via
          `meta.section = "ctc"` (see "Access control model" below for why
          that's a separate concept from `meta.id`/routing). Each joins
          `db.ctcActuals`/`db.ctcBudget` rows to Division/Department via
          `db.costCenterIndex.get(row.costCenter)` client-side (no FK, no
          server-side join — same reasoning as employee_master/employeeIndex).
      admin.js            "Manage Access" — checkbox grid over all users
                           (full_access / is_admin / per-section), auto-saves
                           on change, id: "admin"
      data-refresh.js      "Data Refresh" — upload updated Excel workbooks,
                           parses client-side via SheetJS, preview then full
                           replace (delete+insert) per table, progress bar,
                           writes to data_refresh_log. id: "data-refresh".
                           employee_master and the 4 CTC tables are upserted
                           instead of delete+insert (see gotchas below) — the
                           4 CTC tables are 4 separate upload cards (13a-13d),
                           not one bundled file, since Actuals refreshes
                           monthly but Cost Centers/Budget/Revenue don't.
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
supabase/
  *.sql                 migrations, run manually via Supabase SQL Editor, in
                         NUMBER ORDER (01 through 12 so far — see below)
  csv/                  one-time CSV export used for the original data load
                         (via Table Editor import) — historical, not live
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
   `leave`, `performance`, `training`, `attendance`, `ctc`). Each data table has a
   `"sectioned read"` RLS policy scoped to whichever sections legitimately
   read that table client-side (see the table-to-section map hardcoded in
   both `data.js`'s `SECTION_TABLES` and `06_section_based_access.sql`/
   `11_attendance_violations.sql`/`12_ctc_report.sql`/`13_newhires_salary_access.sql`
   — keep these in sync if any changes).
   Note: `exec` needs read access to attrition/leave/absenteeism/base_salary
   too, since Executive Insights aggregates those client-side — granting
   `exec` is broader than it looks. Same reasoning behind why `recruitment`
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
