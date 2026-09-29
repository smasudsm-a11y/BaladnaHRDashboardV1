-- Promotion history: real SAP employee-action events (Promotion, Promotion
-- due to Transfer, Merit Increase, Job Regrade, Benefit Adjustment, plus a
-- couple of still-unconfirmed codes), sourced from the SAP batch's
-- report_Merit_Increase_and_Promotions_List.csv. That file is a Group-wide
-- extract; see scripts/sap-migration/build_promotion_history.ps1 for the
-- Baladna-only (Qatar + Egypt) scoping and the same-day duplicate collapse.
--
-- One row per event (an employee can have many). Every event-reason code is
-- stored, not just promotions -- the Promotions page decides which codes
-- count, so Merit Increase/Job Regrade analysis can reuse this table later
-- without a reload. event_reason stays the raw SAP code (e.g. 'ESC-PR');
-- the human label lives in the page, since two codes are still unconfirmed.
--
-- New `promotions` section (auto-appears in Manage Access).

create table promotion_history (
  id            bigint generated always as identity primary key,
  employee_id   text not null references employee_master(employee_id),
  event_date    date not null,
  end_date      date,
  event_reason  text not null,
  company_code  text
);

create index promotion_history_employee_idx on promotion_history (employee_id);

alter table promotion_history enable row level security;

-- Same section grant + divisional-access join as every other
-- employee_id-keyed table (see 24_divisional_access.sql).
create policy "sectioned read" on promotion_history for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['promotions']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = promotion_history.employee_id)));

-- Full delete+insert replace on each upload (the source is a complete
-- history extract every time, not an increment) -- same as recruitment/
-- diversity. Update isn't needed for that, but granted for parity with the
-- other admin-managed tables.
create policy "admin insert" on promotion_history for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on promotion_history for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on promotion_history for delete to authenticated using (public.is_admin(auth.uid()));

-- The Promotions page needs employee_master too (names/departments for the
-- events, and historical active headcount as the promotion-rate
-- denominator) -- widen its sectioned-read policy, same as every prior new
-- module. Recreated in full from 24_divisional_access.sql's version plus
-- 'promotions'.
drop policy "sectioned read" on employee_master;
create policy "sectioned read" on employee_master for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['exec','headcount','newhires','compensation','attrition','leave','performance','training','recruitment','succession','probation-pip','enps','headcount-forecast','promotions']::text[]))
  and public.division_allowed(auth.uid(), division));
