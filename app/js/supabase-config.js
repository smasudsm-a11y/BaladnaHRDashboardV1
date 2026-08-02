// Public Supabase project identifiers — safe to commit. The anon key is not a secret;
// it identifies the "anonymous" role and access is governed entirely by the Row Level
// Security policies on each table (see supabase/03_enable_rls_readonly.sql).
// Never put the service_role key or a database connection string here.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
