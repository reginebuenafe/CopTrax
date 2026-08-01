// create-staff-account/index.ts
// Called by the Business Owner to create Weigher or Laboratory Staff accounts.
// Uses the Supabase Admin API (service role) to create the auth user and profile row.
// The account is Active immediately — no pending/approval step for these roles.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    // Use service-role client for everything — verify caller JWT directly
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Validate the caller's JWT (works even with RLS bypassed)
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    // Verify caller is Business Owner (no RLS issues with service role)
    const { data: callerProfile, error: profileErr } = await admin
      .from("users")
      .select("role_id, roles!inner(role_name)")
      .eq("user_id", caller.id)
      .single();

    if (profileErr || !callerProfile) {
      return json({ error: `Caller profile not found: ${profileErr?.message}` }, 403);
    }
    // @ts-ignore
    if (callerProfile.roles?.role_name !== "Business Owner") {
      return json({ error: "Only the Business Owner can create staff accounts" }, 403);
    }

    const { first_name, last_name, email, phone, address, role_name, password } = await req.json();

    if (!first_name || !last_name || !email || !role_name || !password) {
      return json({ error: "first_name, last_name, email, role_name, and password are required" }, 400);
    }
    if (!["Weigher", "Laboratory Staff"].includes(role_name)) {
      return json({ error: "role_name must be 'Weigher' or 'Laboratory Staff'" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Look up role_id
    const { data: roleRow, error: roleErr } = await admin
      .from("roles")
      .select("role_id")
      .eq("role_name", role_name)
      .single();

    if (roleErr || !roleRow) {
      return json({ error: `Role '${role_name}' not found: ${roleErr?.message}` }, 500);
    }

    // Create auth user (email_confirm: true — active immediately, no email needed)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      const msg = createErr.message ?? "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate")) {
        return json({ error: "An account with that email already exists." }, 409);
      }
      return json({ error: msg }, 500);
    }

    const newUserId = created.user.id;

    // Insert into public.users — the auth trigger (handle_new_auth_user) also fires,
    // but it uses ON CONFLICT DO NOTHING so our explicit insert wins.
    const { error: insertErr } = await admin.from("users").upsert({
      user_id:        newUserId,
      role_id:        roleRow.role_id,
      first_name,
      last_name,
      email,
      phone:          phone ?? null,
      address:        address ?? null,
      account_status: "Active",
      approved_by:    caller.id,
      approved_at:    new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (insertErr) {
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: `Profile insert failed: ${insertErr.message}` }, 500);
    }

    return json({ success: true, user_id: newUserId });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
