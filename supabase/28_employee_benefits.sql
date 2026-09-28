-- Employee Benefits: real non-cash CTC benefit values (Housing, Transportation,
-- Communication, Education, Medical Insurance), Air Ticket entitlement
-- (Ticket Class/Cycle), and OT/Variable Pay eligibility -- sourced from the
-- SAP batch's Test3 (Job Info) export, previously thought to have no usable
-- join key at all (its "Person Id" column is a SuccessFactors-internal id
-- that matches nothing in employee_master). Test3 actually carries a SECOND,
-- differently-cased "Person ID" column that matches employee_master.employee_id
-- 100% (3,148/3,148, verified directly) -- that's the real bridge, and what
-- this table's employee_id is built from. See
-- scripts/sap-migration/build_employee_benefits.ps1 for the extraction (and
-- its own comment for why the two "Person ID" columns collided unnoticed
-- during the original migration).
--
-- One row per employee -- a current-snapshot join, not a dated history
-- (Test3 itself is a point-in-time Job Info export, same reasoning as
-- headcount_forecast/critical_positions having no history grain either).
-- Shares Compensation's access grant (meta.section, like total_rewards)
-- rather than getting its own section -- this is compensation detail, not a
-- distinct dashboard module.

create table employee_benefits (
  employee_id                text primary key references employee_master(employee_id),
  employment_type            text,
  housing_ctc                numeric,
  transportation_ctc         numeric,
  communication_allowance    numeric,
  education_allowance        numeric,
  medical_insurance_expense  numeric,
  ticket_class               text,
  ticket_cycle               text,
  ot_eligibility             text,
  variable_pay_eligibility   text
);

alter table employee_benefits enable row level security;

-- Same section grant + divisional-access join as total_rewards (24_divisional_access.sql).
create policy "sectioned read" on employee_benefits for select to authenticated using (
  exists (select 1 from user_access ua where ua.user_id = auth.uid()
    and (ua.full_access or ua.sections && array['compensation']::text[]))
  and public.division_allowed(auth.uid(), (select em.division from employee_master em where em.employee_id = employee_benefits.employee_id)));

-- Upserted by employee_id (a re-upload should only update existing rows, same
-- reasoning as employee_master itself) -- needs admin update as well as
-- insert/delete.
create policy "admin insert" on employee_benefits for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "admin update" on employee_benefits for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin delete" on employee_benefits for delete to authenticated using (public.is_admin(auth.uid()));
