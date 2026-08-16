-- Power BI Parity Round 2, Phase H: Succession Planning — a new module,
-- synthetic from day one (no real succession roster exists to reconcile
-- against), same philosophy as Payroll/Attendance Violations, not the CTC
-- Report module's real-data-then-resynthesize approach. See CLAUDE.md
-- "Power BI Parity — Round 2" for the full phase list, and
-- scripts/succession-data/generate_succession_data.ps1 for exactly how the
-- 45-row roster was derived from real employee_master fields (criticality
-- from position_title, retirement risk from age, readiness from tenure).
--
-- 3 tables, matching the phase's own plan: critical positions, incumbents
-- (one row per position — separate table rather than columns on
-- critical_positions, since "Position Holders"/"Incumbents detail table"
-- are their own Power BI report sections), and successors/readiness.
-- Delete+insert on refresh (no upsert key) — a succession roster is a
-- point-in-time snapshot Total Rewards replaces wholesale when revised, not
-- an accumulating monthly table like payroll/ctc_actuals.

create table critical_positions (
  position_id     text primary key,
  position_title  text not null,
  department      text,
  division        text,
  business_unit   text,
  job_grade       text,
  criticality     text check (criticality in ('Critical', 'High', 'Medium'))
);

-- position_id is ON DELETE CASCADE (unlike the employee_id FKs, which stay
-- default/restrictive) — the Data Refresh panel's generic replace logic
-- deletes-then-inserts each of this module's 3 sheets SEQUENTIALLY, not
-- all-deletes-then-all-inserts, so a re-upload's delete of critical_positions
-- would otherwise hit a foreign-key violation against the OLD incumbents/
-- successors rows that still reference those position_ids (they aren't
-- cleared until their own sheet's turn comes later in the same upload).
-- Cascading here means step 1 (delete+insert critical_positions) also wipes
-- any old incumbents/successors rows still pointing at the old roster,
-- before step 2/3 insert the new ones.
create table incumbents (
  id                   bigint generated always as identity primary key,
  position_id          text references critical_positions(position_id) on delete cascade,
  employee_id          text references employee_master(employee_id), -- null = vacant position
  time_in_role_years   numeric,
  retirement_risk      text check (retirement_risk in ('Low', 'Medium', 'High'))
);

create table successors (
  id                      bigint generated always as identity primary key,
  position_id             text references critical_positions(position_id) on delete cascade,
  successor_employee_id   text references employee_master(employee_id),
  readiness               text check (readiness in ('Ready Now', 'Ready 1-2 Years', 'Ready 3-5 Years', 'Not Ready')),
  is_high_potential       boolean not null default false
);

create index on incumbents (position_id);
create index on successors (position_id);

alter table critical_positions enable row level security;
alter table incumbents enable row level security;
alter table successors enable row level security;

-- New section id: "succession". Add it to a user's user_access.sections (or
-- give them full_access) via the Manage Access panel, same as any other section.

create policy "sectioned read" on critical_positions for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession']::text[])));

create policy "sectioned read" on incumbents for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession']::text[])));

create policy "sectioned read" on successors for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['succession']::text[])));

create policy "admin insert" on critical_positions for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on critical_positions for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on critical_positions for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on incumbents for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on incumbents for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on incumbents for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on successors for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on successors for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on successors for delete to authenticated using (public.is_admin(auth.uid()));

-- Widen employee_master's sectioned-read policy to include "succession" —
-- the page joins incumbents.employee_id / successors.successor_employee_id
-- back to employee_master client-side (name, department, grade, etc.), same
-- reasoning as every prior widening in this file's history (13/16).
drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment','succession']::text[])));
