-- Fixes "infinite recursion detected in policy for relation user_access".
-- The previous policies checked is_admin via a subquery directly on
-- user_access, which re-triggers the same RLS policy recursively. The fix is
-- a SECURITY DEFINER function: it runs with the function owner's privileges,
-- so its internal lookup doesn't re-invoke the calling policy.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from user_access where user_id = uid), false);
$$;

drop policy "read own or admin" on user_access;
create policy "read own or admin" on user_access
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy "admin update any row" on user_access;
create policy "admin update any row" on user_access
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
