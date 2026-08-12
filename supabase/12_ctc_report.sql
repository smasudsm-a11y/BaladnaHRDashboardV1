-- CTC Report: real Budget vs Actual cost-to-company data (GL x Cost Center x
-- Month), Revenue, and a Cost Center -> Division/Department lookup. Unlike
-- every other module, this is REAL company financial data (not synthetic),
-- and Actuals/Budget/Revenue all accumulate incrementally month by month
-- rather than being fully replaced on each upload — see the unique
-- constraints below, which are the upsert keys used by the Data Refresh
-- panel's CTC card (and the CTC Data Converter's output).
--
-- No FK from ctc_actuals/ctc_budget.cost_center to cost_centers.cost_center,
-- matching this app's existing convention (e.g. base_salary.grade has no FK
-- to salary_structure.grade) — keeps each table independently loadable.

create table cost_centers (
  cost_center  text primary key,
  division     text,
  department   text
);

create table ctc_actuals (
  id            bigint generated always as identity primary key,
  period        date not null,
  gl_code       text not null,
  gl_name       text,
  fs_category   text,
  cost_center   text not null,
  amount        numeric not null,
  unique (period, gl_code, cost_center)
);

create index on ctc_actuals (period);
create index on ctc_actuals (cost_center);

create table ctc_budget (
  id            bigint generated always as identity primary key,
  period        date not null,
  gl_code       text not null,
  gl_name       text,
  fs_category   text,
  cost_center   text not null,
  amount        numeric not null,
  unique (period, gl_code, cost_center)
);

create index on ctc_budget (period);
create index on ctc_budget (cost_center);

create table ctc_revenue (
  id               bigint generated always as identity primary key,
  period           date not null unique,
  actual_revenue   numeric,
  budget_revenue   numeric
);

alter table cost_centers enable row level security;
alter table ctc_actuals  enable row level security;
alter table ctc_budget   enable row level security;
alter table ctc_revenue  enable row level security;

-- New section id: "ctc". Add it to a user's user_access.sections (or give
-- them full_access) via the Manage Access panel, same as any other section.

create policy "sectioned read" on cost_centers for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['ctc']::text[])));

create policy "sectioned read" on ctc_actuals for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['ctc']::text[])));

create policy "sectioned read" on ctc_budget for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['ctc']::text[])));

create policy "sectioned read" on ctc_revenue for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['ctc']::text[])));

-- All 4 tables are upserted (by their unique key above), never delete+insert —
-- each monthly Actuals/Budget/Revenue upload should only touch that month's
-- rows, not wipe out prior months. Needs admin insert AND update (unlike the
-- plain delete+insert tables elsewhere, which only need insert+delete).

create policy "admin insert" on cost_centers for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on cost_centers for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on cost_centers for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on ctc_actuals for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on ctc_actuals for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on ctc_actuals for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on ctc_budget for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on ctc_budget for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on ctc_budget for delete to authenticated using (public.is_admin(auth.uid()));

create policy "admin insert" on ctc_revenue for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on ctc_revenue for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on ctc_revenue for delete to authenticated using (public.is_admin(auth.uid()));
