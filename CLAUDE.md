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
  Serves `app/` at `http://localhost:8843/`.
- **No bundler.** Every `<script>` is either a plain global (vendored libs) or
  a native ES module (`app/js/*.js`, loaded via `<script type="module">`).
- **Vendored libraries** in `app/js/vendor/` (all loaded as globals via `<script>`
  tags in `app/index.html`, in this order): `chart.umd.min.js` (Chart.js),
  `xlsx.full.min.js` (SheetJS — used for both Excel export AND reading uploaded
  workbooks), `pptxgen.bundle.js` (PptxGenJS), `supabase.min.js` (Supabase JS
  client v2, global `supabase.createClient`).
- **Excel data source**: `Database/*.xlsx` (12 workbooks) is the original
  authoring format Total Rewards edits monthly/weekly. `PRD/HR_Analytics_Dashboard_Suite_PRD.md`
  is the product spec (converted from the original .docx). `12_Attendance_Violations.xlsx`
  is synthetic-only (no real source workbook was ever committed) — see the
  Attendance Violations gotcha below for why it's a separate population.
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
      admin.js            "Manage Access" — checkbox grid over all users
                           (full_access / is_admin / per-section), auto-saves
                           on change, id: "admin"
      data-refresh.js      "Data Refresh" — upload updated Excel workbooks,
                           parses client-side via SheetJS, preview then full
                           replace (delete+insert) per table, progress bar,
                           writes to data_refresh_log. id: "data-refresh".
                           employee_master is the one exception: it's upserted
                           by employee_id, not delete+insert (see gotcha below)
supabase/
  *.sql                 migrations, run manually via Supabase SQL Editor, in
                         NUMBER ORDER (01 through 10 so far — see below)
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
   `leave`, `performance`, `training`, `attendance`). Each data table has a
   `"sectioned read"` RLS policy scoped to whichever sections legitimately
   read that table client-side (see the table-to-section map hardcoded in
   both `data.js`'s `SECTION_TABLES` and `06_section_based_access.sql`/
   `11_attendance_violations.sql` — keep these in sync if either changes).
   Note: `exec` needs read access to attrition/leave/absenteeism/base_salary
   too, since Executive Insights aggregates those client-side — granting
   `exec` is broader than it looks.
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
