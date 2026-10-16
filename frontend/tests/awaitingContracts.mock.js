import { createClient } from "@supabase/supabase-js";

const client = createClient(window.location.origin, "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
export const supabase = {
  from: client.from.bind(client), rpc: client.rpc.bind(client), storage: client.storage,
  auth: { async getSession() { return { data: { session: { access_token: "fixture-only-token" } } }; } },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {},
};
export function useAuth() { return { user: { id: "owner" } }; }
