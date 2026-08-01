// delete-user-account/index.ts
// Called by the Business Owner to delete a Supplier, Weigher, or Lab Staff account.
// Performs a soft-delete: sets account_status = 'Deleted' in public.users,
// and bans the auth user via the Admin API so they cannot log in.
// Historical data (contracts, deliveries, payments, etc.) is preserved.

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

    // Step 1: validate caller JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) {
      return json({ error: `Unauthorized: ${authErr?.message ?? "no user"}` }, 401);
    }

    // Step 2: get caller's role_id
    const { data: callerRow, error: callerErr } = await admin
      .from("users")
      .select("role_id")
      .eq("user_id", caller.id)
      .single();

    if (callerErr || !callerRow?.role_id) {
      return json({ error: `Caller profile not found (user_id=${caller.id}): ${callerErr?.message}` }, 403);
    }

    // Step 3: resolve role_id → role_name
    const { data: callerRoleRow, error: callerRoleErr } = await admin
      .from("roles")
      .select("role_name")
      .eq("role_id", callerRow.role_id)
      .single();

    if (callerRoleErr || callerRoleRow?.role_name !== "Business Owner") {
      return json({ error: "Only the Business Owner can delete accounts" }, 403);
    }

    // Step 4: validate request body
    const { target_user_id } = await req.json();
    if (!target_user_id) return json({ error: "target_user_id is required" }, 400);
    if (target_user_id === caller.id) {
      return json({ error: "Cannot delete your own account" }, 400);
    }

    // Step 5: verify target exists and is not BO / already deleted
    const { data: target, error: tErr } = await admin
      .from("users")
      .select("user_id, account_status, role_id")
      .eq("user_id", target_user_id)
      .single();

    if (tErr || !target) return json({ error: "User not found" }, 404);
    if (target.account_status === "Deleted") {
      return json({ error: "Account is already deleted" }, 400);
    }

    // Verify the target is not a Business Owner
    if (target.role_id) {
      const { data: targetRole } = await admin
        .from("roles")
        .select("role_name")
        .eq("role_id", target.role_id)
        .single();
      if (targetRole?.role_name === "Business Owner") {
        return json({ error: "Cannot delete the Business Owner account" }, 403);
      }
    }

    // Step 6: soft-delete the profile
    const { error: updateErr } = await admin
      .from("users")
      .update({ account_status: "Deleted" })
      .eq("user_id", target_user_id);

    if (updateErr) return json({ error: `Profile update failed: ${updateErr.message}` }, 500);

    // Step 7: ban the auth user (prevents login; preserves data)
    const { error: banErr } = await admin.auth.admin.updateUserById(target_user_id, {
      ban_duration: "87600h", // 10 years
    });

    if (banErr) {
      // Roll back profile update so state stays consistent
      await admin.from("users").update({ account_status: target.account_status }).eq("user_id", target_user_id);
      return json({ error: `Auth ban failed: ${banErr.message}` }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
