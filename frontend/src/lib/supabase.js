import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Keep the Supabase project awake so sign-in is never delayed by a cold start.
// Pings a cheap REST health endpoint every 4 minutes.
setInterval(() => {
  fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { apikey: supabaseAnonKey },
  }).catch(() => {});
}, 4 * 60 * 1000);
