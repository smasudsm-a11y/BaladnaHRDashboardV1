select user_id, email, full_access, is_admin, sections from user_access order by email;

select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'user_access';
