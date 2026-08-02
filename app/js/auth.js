import { getClient } from "./supabase-client.js";

export async function signIn(email, password) {
  const client = getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const client = getClient();
  await client.auth.signOut();
}

// Fires immediately with the current session (if any) on subscribe, and again on every
// sign-in/sign-out/token-refresh. Returns the unsubscribe handle.
export function onAuthStateChange(callback) {
  const client = getClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}
