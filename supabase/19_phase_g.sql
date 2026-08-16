-- Power BI Parity Round 2, Phase G: Targets/Benchmarks. A small,
-- cross-cutting `kpi_targets` table (metric id -> target value) surfaced as
-- a delta/target line on Attrition, Executive, and Leave & Absence's rate
-- KPIs — the three pages CLAUDE.md's Phase G plan named. See CLAUDE.md
-- "Power BI Parity — Round 2" for the full phase list.
--
-- Target values here are invented business benchmarks (no real Power BI
-- target data was ever provided to reconcile against, unlike CTC Report) —
-- plausible round numbers for a stable food/agri workforce, same "looks
-- real, isn't" synthetic philosophy as every other invented figure in this
-- app. `direction` records whether lower or higher is the "good" side, so
-- the app can compute a generic good/bad delta without hardcoding it per
-- metric on every page that surfaces it.
create table kpi_targets (
  metric_id       text primary key,
  metric_label    text not null,
  target_value    numeric not null,
  direction       text not null check (direction in ('lower_is_better', 'higher_is_better')),
  unit            text not null default 'percent'
);

insert into kpi_targets (metric_id, metric_label, target_value, direction, unit) values
  ('turnover_rate', 'Turnover / Attrition Rate', 10.0, 'lower_is_better', 'percent'),
  ('retention_rate', 'Retention Rate', 90.0, 'higher_is_better', 'percent'),
  ('absenteeism_rate_staff', 'Absenteeism Rate — Staff', 2.5, 'lower_is_better', 'percent'),
  ('absenteeism_rate_labor', 'Absenteeism Rate — Labor', 4.0, 'lower_is_better', 'percent');

alter table kpi_targets enable row level security;

-- Read access mirrors exactly the 3 pages Phase G touches (Executive,
-- Attrition, Leave & Absence) — no other section needs this table.
create policy "sectioned read" on kpi_targets for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec', 'attrition', 'leave']::text[])));

-- Small reference table, upserted by metric_id (same reasoning as
-- cost_centers/budgeted_positions) so a target revision never needs a
-- delete step.
create policy "admin insert" on kpi_targets for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on kpi_targets for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on kpi_targets for delete to authenticated using (public.is_admin(auth.uid()));
