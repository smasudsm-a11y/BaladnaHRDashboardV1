-- Power BI Parity Round 2, Phase L: Executive Insights rollup. The last
-- phase on the Round 2 plan — deliberately last since most of what it
-- surfaces doesn't exist until Phase G (kpi_targets), Phase H (Succession
-- Planning), and Phase J (eNPS/Employee Lifecycle Score) have already
-- landed. See CLAUDE.md "Power BI Parity — Round 2" for the full phase
-- list.
--
-- Three things, matching the phase's own plan:
--   1. Succession Coverage % on Executive — reuses Phase H's own
--      critical_positions/successors tables, so this is a read-access
--      widening only, no new table.
--   2. Employee Lifecycle Score on Executive — reuses Phase J's own
--      stage_gate_scores table, same reasoning.
--   3. Target lines on existing KPIs — Executive's "Attrition Rate (TTM)"
--      already got its targetDelta("turnover_rate") wiring in Phase G
--      (19_phase_g.sql), which explicitly named Executive as one of its 3
--      target pages. Nothing further needed here.
--   4. A new small Initiatives tracker (name + status) — genuinely has no
--      dependencies, the only net-new table in this migration.

-- Widen critical_positions/successors' sectioned-read policies to include
-- "exec" — Executive's new Succession Coverage % KPI reads both tables
-- directly (count of positions, count of distinct positions with a named
-- successor), same reasoning as every prior sectioned-read widening in
-- this file's history.
drop policy "sectioned read" on critical_positions;
create policy "sectioned read" on critical_positions for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession', 'exec']::text[])));

drop policy "sectioned read" on successors;
create policy "sectioned read" on successors for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession', 'exec']::text[])));

-- Widen stage_gate_scores' sectioned-read policy to include "exec" —
-- Executive's new Employee Lifecycle Score KPI averages this table's
-- `score` column directly, same 4-stage average enps.js's own KPI already
-- computes.
drop policy "sectioned read" on stage_gate_scores;
create policy "sectioned read" on stage_gate_scores for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['enps', 'exec']::text[])));

-- Initiatives tracker — invented sample HR initiatives (no source workbook
-- exists for this, same "seeded directly by the migration" pattern as
-- kpi_targets/budgeted_positions), upserted by `name` since that's this
-- table's own natural key, same reasoning as kpi_targets' metric_id.
create table initiatives (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  status   text not null check (status in ('Completed', 'In Progress', 'Overdue'))
);

insert into initiatives (name, status) values
  ('Compensation Benchmarking Study', 'Completed'),
  ('Manager Leadership Training Program', 'In Progress'),
  ('Employee Engagement Survey Rollout', 'In Progress'),
  ('HRIS Data Quality Cleanup', 'Completed'),
  ('Succession Bench Strength Review', 'In Progress'),
  ('Overtime Policy Revision', 'Overdue'),
  ('Diversity & Inclusion Council Launch', 'Completed'),
  ('Onboarding Experience Redesign', 'Overdue');

alter table initiatives enable row level security;

-- Only Executive reads this — no other page has a use for it.
create policy "sectioned read" on initiatives for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec']::text[])));

create policy "admin insert" on initiatives for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on initiatives for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on initiatives for delete to authenticated using (public.is_admin(auth.uid()));
