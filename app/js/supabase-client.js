import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

let client = null;

export function getClient() {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase is not configured yet — fill in SUPABASE_URL and SUPABASE_ANON_KEY in app/js/supabase-config.js.");
    }
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
