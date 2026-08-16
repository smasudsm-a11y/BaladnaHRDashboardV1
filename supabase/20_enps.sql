-- Power BI Parity Round 2, Phase J: Employee Satisfaction / eNPS — a new
-- module, synthetic from day one (no real exit-survey or lifecycle-score
-- data exists to reconcile against), same philosophy as Succession
-- Planning/Probation & PIP. See CLAUDE.md "Power BI Parity — Round 2" for
-- the full phase list, and scripts/enps-data/generate_enps_data.ps1 for
-- exactly how scores were derived from real employee_master/attrition
-- fields (termination reason, early-termination timing) — nothing here is
-- a random draw.

create table exit_surveys (
  id                bigint generated always as identity primary key,
  employee_id       text references employee_master(employee_id),
  survey_date       date,
  enps_score        numeric check (enps_score >= 0 and enps_score <= 10),
  enps_category     text check (enps_category in ('Promoter', 'Passive', 'Detractor')),
  would_recommend   boolean
);

create table stage_gate_scores (
  id            bigint generated always as identity primary key,
  employee_id   text references employee_master(employee_id),
  stage         text check (stage in ('Interview', 'Recruiting', 'Onboarding', 'Probation')),
  score         numeric check (score >= 0 and score <= 10),
  score_date    date
);

create index on exit_surveys (employee_id);
create index on stage_gate_scores (employee_id);

alter table exit_surveys enable row level security;
alter table stage_gate_scores enable row level security;

-- New section id: "enps". Add it to a user's user_access.sections (or
-- give them full_access) via the Manage Access panel, same as any other
-- section.

create policy "sectioned read" on exit_surveys for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['enps']::text[])));

create policy "sectioned read" on stage_gate_scores for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['enps']::text[])));

-- Delete+insert on refresh (no upsert key) — like Succession Planning/
-- Probation & PIP, this is a point-in-time roster Total Rewards replaces
-- wholesale when revised, not an accumulating monthly table.

create policy "admin insert" on exit_surveys for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on exit_surveys for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on exit_surveys for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on stage_gate_scores for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on stage_gate_scores for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on stage_gate_scores for delete to authenticated using (public.is_admin(auth.uid()));

-- Widen employee_master's sectioned-read policy to include "enps" — the
-- page joins both tables back to employee_master client-side (name,
-- department, grade, etc.), same reasoning as every prior widening in this
-- file's history (13/16/18/20).
drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment','succession','probation-pip','enps']::text[])));
