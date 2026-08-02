-- employee_master is FK'd by 9 other tables (org_hierarchy, diversity, attrition,
-- base_salary, total_rewards, leave, absenteeism, performance, training). The Data
-- Refresh panel's delete-then-insert replace pattern violates those constraints the
-- moment any of those tables has real data, since it clears employee_master (and
-- everything referencing it goes dangling) before re-inserting. employee_master is
-- refreshed via upsert (insert-or-update by employee_id) instead, which needs an
-- admin UPDATE policy — the existing admin insert/delete policies aren't enough.

create policy "admin update" on employee_master for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
