/**
 * verify_caller.ts — shared caller-authentication helper for Edge Functions
 * that mutate negotiation/chat data on behalf of a specific participant
 * (e.g. ai-faq, ai-negotiate).
 *
 * Two legitimate ways an Edge Function in this project is invoked:
 *   1. Directly from the frontend via `supabase.functions.invoke(...)`,
 *      which automatically forwards the signed-in user's JWT in the
 *      `Authorization` header — we verify it and get a real user id.
 *   2. From a DB trigger via `pg_net.http_post`, which has no user session
 *      and authenticates with a database-generated internal secret. The
 *      Edge Function reads the expected value through its service-role
 *      client; the secret is never readable by frontend clients.
 *
 * Without this check, anyone who obtained a `proposal_id`/`conversation_id`
 * UUID (e.g. from a shared link, browser history, or bug report) could
 * invoke the function directly and trigger negotiation state changes,
 * contract generation, or AI replies attributed to the Business Owner for
 * a conversation they have nothing to do with.
 */
import { createClient } from "@supabase/supabase-js";

export type CallerCheck = {
  ok: boolean;
  userId: string | null;
  trustedInternal: boolean;
};

/**
 * Verifies the request's Authorization header and returns whether the
 * caller is authorized. `allowedUserIds` should contain the user id(s)
 * that are legitimately allowed to trigger this action (e.g. the
 * conversation's business_owner_id or supplier_id) — any non-null match
 * authorizes the call. Set `allowTrustedInternal` only for functions with
 * a legitimate database-trigger invocation path.
 */
export async function verifyCaller(
  req: Request,
  allowedUserIds: (string | null | undefined)[],
  allowTrustedInternal = false,
): Promise<CallerCheck> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, userId: null, trustedInternal: false };

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const internalSecret = req.headers.get("X-CopTrax-Internal-Secret")?.trim();
  if (allowTrustedInternal && internalSecret) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await serviceClient
      .from("app_config")
      .select("value")
      .eq("key", "ai_internal_secret")
      .maybeSingle();

    if (!error && data?.value && internalSecret === data.value) {
      return { ok: true, userId: null, trustedInternal: true };
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) return { ok: false, userId: null, trustedInternal: false };

  const uid = data.user.id;
  const ok = allowedUserIds.some((id) => !!id && id === uid);
  return { ok, userId: uid, trustedInternal: false };
}
