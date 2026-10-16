import { createClient } from "@supabase/supabase-js";

// Real query builder, intercepted local HTTP responses; no hosted auth or data.
export const supabase = createClient(window.location.origin, "fixture-anon-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
export function useAuth() {
  return {
    user: { id: new URLSearchParams(window.location.search).get("supplier") || "supplier-a" },
    beginSensitiveContext() {}, endSensitiveContext() {},
  };
}
