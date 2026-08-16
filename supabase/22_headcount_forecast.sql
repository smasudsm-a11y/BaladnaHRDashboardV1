-- Power BI Parity Round 2, Phase K: Headcount Forecast — a new module, no
-- new employee_master joins for a live "current" figure needed beyond what
-- headcount.js/executive.js already compute (isActiveAsOf against
-- month-end cutoffs). No actual forecasting model exists here (this is a
-- static site with no backend compute to train one) — see
-- scripts/headcount-forecast-data/generate_headcount_forecast_data.ps1 for
-- exactly how the Forecast/Lower/Upper series was projected off each
-- division's own real trailing-12-month headcount trend, deterministically
-- (no random draw), same philosophy as Succession Planning/Probation & PIP/
-- eNPS.
--
-- Deliberately does NOT store an "Actual" scenario row at all — unlike
-- every other synthetic Round 2 table, Actual headcount is perfectly
-- derivable from employee_master's own hire_date/termination_date (that's
-- exactly what headcount.js's "Headcount Trend" chart and executive.js's
-- own headcount trend already do), so storing a duplicate copy here would
-- just be redundant data that could drift out of sync with the real
-- population. This table holds ONLY the forward-looking forecast: one row
-- per (period, division) for the 12 months following this app's fixed
-- "today" (see data.js's REFERENCE_TODAY), with a lower/upper confidence
-- band that widens with the forecast horizon.

create table headcount_forecast (
  id                  bigint generated always as identity primary key,
  period              date not null,
  division            text not null,
  forecast_headcount  integer not null,
  lower_bound         integer not null,
  upper_bound         integer not null,
  unique (period, division)
);

create index on headcount_forecast (period);
create index on headcount_forecast (division);

alter table headcount_forecast enable row level security;

-- New section id: "headcount-forecast". Add it to a user's
-- user_access.sections (or give them full_access) via the Manage Access
-- panel, same as any other section.

create policy "sectioned read" on headcount_forecast for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['headcount-forecast']::text[])));

-- Upserted by (period, division) on refresh, not delete+insert — same
-- reasoning as payroll's (employee_id, period): a rolling forecast that
-- gets regenerated periodically should only touch the periods/divisions in
-- that upload, not wipe the whole table. Needs admin update as well as
-- insert/delete for the same reason.

create policy "admin insert" on headcount_forecast for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on headcount_forecast for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on headcount_forecast for delete to authenticated using (public.is_admin(auth.uid()));

-- Widen employee_master's sectioned-read policy to include
-- "headcount-forecast" — the page's own live "Current Headcount" figure
-- (and the historical portion of its trend chart) reads employee_master
-- directly, same reasoning as every prior widening in this file's history
-- (13/16/18/20/21).
drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment','succession','probation-pip','enps','headcount-forecast']::text[])));
