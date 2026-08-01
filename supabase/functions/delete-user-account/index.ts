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
    // Verify caller is Business Owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile } = await anonClient
      .from("users")
      .select("roles(role_name)")
      .eq("user_id", caller.id)
      .single();

    // @ts-ignore
    if (callerProfile?.roles?.role_name !== "Business Owner") {
      return json({ error: "Only the Business Owner can delete accounts" }, 403);
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) return json({ error: "target_user_id is required" }, 400);

    // Cannot delete yourself
    if (target_user_id === caller.id) {
      return json({ error: "Cannot delete your own account" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify target exists and is not already deleted and is not Business Owner
    const { data: target, error: tErr } = await admin
      .from("users")
      .select("user_id, account_status, roles(role_name)")
      .eq("user_id", target_user_id)
      .single();

    if (tErr || !target) return json({ error: "User not found" }, 404);
    // @ts-ignore
    if (target.roles?.role_name === "Business Owner") {
      return json({ error: "Cannot delete the Business Owner account" }, 403);
    }
    if (target.account_status === "Deleted") {
      return json({ error: "Account is already deleted" }, 400);
    }

    // 1. Soft-delete in public.users
    const { error: updateErr } = await admin
      .from("users")
      .update({ account_status: "Deleted" })
      .eq("user_id", target_user_id);

    if (updateErr) return json({ error: `Profile update failed: ${updateErr.message}` }, 500);

    // 2. Ban the auth user (prevents login; does not delete auth data)
    const { error: banErr } = await admin.auth.admin.updateUserById(target_user_id, {
      ban_duration: "87600h", // 10 years — effectively permanent
    });

    if (banErr) {
      // Auth ban failed — roll back the profile update so state stays consistent
      await admin.from("users").update({ account_status: target.account_status }).eq("user_id", target_user_id);
      return json({ error: `Auth ban failed: ${banErr.message}` }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
