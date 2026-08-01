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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1: validate the caller's JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) {
      return json({ error: `Unauthorized: ${authErr?.message ?? "no user"}` }, 401);
    }

    // Step 2: get the caller's role_id from public.users
    const { data: callerRow, error: callerErr } = await admin
      .from("users")
      .select("role_id")
      .eq("user_id", caller.id)
      .single();

    if (callerErr || !callerRow) {
      return json({ error: `Caller profile not found (user_id=${caller.id}): ${callerErr?.message}` }, 403);
    }
    if (!callerRow.role_id) {
      return json({ error: "Caller has no role assigned — contact database admin" }, 403);
    }

    // Step 3: resolve role_id → role_name
    const { data: callerRoleRow, error: callerRoleErr } = await admin
      .from("roles")
      .select("role_name")
      .eq("role_id", callerRow.role_id)
      .single();

    if (callerRoleErr || !callerRoleRow) {
      return json({ error: `Could not resolve caller role (role_id=${callerRow.role_id}): ${callerRoleErr?.message}` }, 403);
    }
    if (callerRoleRow.role_name !== "Business Owner") {
      return json({ error: `Only the Business Owner can create staff accounts (your role: ${callerRoleRow.role_name})` }, 403);
    }

    // Step 4: validate request body
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

    // Step 5: look up the target role_id
    const { data: roleRow, error: roleErr } = await admin
      .from("roles")
      .select("role_id")
      .eq("role_name", role_name)
      .single();

    if (roleErr || !roleRow) {
      return json({ error: `Role '${role_name}' not found in roles table: ${roleErr?.message}` }, 500);
    }

    // Step 6: create auth user — pass role in user_metadata so the trigger
    // inserts the profile with the correct role, then our upsert overrides it
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: role_name },
    });

    if (createErr) {
      const msg = createErr.message ?? "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate")) {
        return json({ error: "An account with that email already exists." }, 409);
      }
      return json({ error: `Auth user creation failed: ${msg}` }, 500);
    }

    const newUserId = created.user.id;

    // Step 7: upsert the full profile row — trigger may have already inserted
    // a partial row (role_id only + Pending status), so we update all fields
    const { error: upsertErr } = await admin.from("users").upsert({
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

    if (upsertErr) {
      // Roll back the auth user to avoid orphaned auth entries
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: `Profile upsert failed: ${upsertErr.message}` }, 500);
    }

    return json({ success: true, user_id: newUserId });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
