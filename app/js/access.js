import { getClient } from "./supabase-client.js";

// Returns { fullAccess, sections } for the given user. A user with no row in
// user_access yet (not provisioned) is treated as having no sections at all —
// deny by default, never silently grant.
export async function getUserAccess(userId) {
  const client = getClient();
  const { data, error } = await client
    .from("user_access")
    .select("full_access, sections, is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load access permissions: ${error.message}`);
  if (!data) return { fullAccess: false, sections: [], isAdmin: false };
  return { fullAccess: !!data.full_access, sections: data.sections || [], isAdmin: !!data.is_admin };
}
