import { createClient } from "@supabase/supabase-js";
const client = createClient(window.location.origin, "fixture-only-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
export const supabase = {
  from: client.from.bind(client),
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {},
};
export function useAuth() { return { user: { id: "supplier" } }; }
