-- Admin access panel: lets an admin manage every user's section access from
-- inside the dashboard instead of hand-editing the user_access table.

alter table user_access add column is_admin boolean not null default false;

update user_access set is_admin = true where email = 's.masud@baladna.com';

-- Backfill any auth.users that don't have a user_access row yet (e.g. test
-- accounts created before this migration).
insert into user_access (user_id, email, full_access, sections, is_admin)
select id, email, false, '{}'::text[], false
from auth.users
on conflict (user_id) do nothing;

-- From here on, every new user created via Supabase Dashboard (or self-signup,
-- if ever enabled) automatically gets a user_access row — no more manual
-- INSERT needed. security definer is required because at signup time the new
-- user has no privileges yet to write to user_access themselves.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_access (user_id, email, full_access, sections, is_admin)
  values (new.id, new.email, false, '{}'::text[], false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Admins need to see and edit every row, not just their own.
drop policy "read own access row" on user_access;

create policy "read own or admin" on user_access
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from user_access ua2 where ua2.user_id = auth.uid() and ua2.is_admin)
  );

create policy "admin update any row" on user_access
  for update to authenticated
  using (exists (select 1 from user_access ua2 where ua2.user_id = auth.uid() and ua2.is_admin))
  with check (exists (select 1 from user_access ua2 where ua2.user_id = auth.uid() and ua2.is_admin));
