-- Widens data_refresh_log's read access from admin-only to every
-- authenticated user. Needed for the "Last Database Sync" indicator in the
-- sidebar footer (app.js), shown to every viewer regardless of section
-- access -- so it can no longer be gated behind public.is_admin(). The
-- table only ever held upload metadata (table_name, row_count,
-- uploaded_by, uploaded_at), never employee data, so this is a deliberate,
-- low-sensitivity trade-off, not a gap: any logged-in viewer could already
-- query this table's contents once granted plain SELECT, but the app itself
-- only ever surfaces the single most recent uploaded_at, not the log detail.

drop policy "admin read log" on data_refresh_log;

create policy "authenticated read log" on data_refresh_log
  for select to authenticated
  using (true);
