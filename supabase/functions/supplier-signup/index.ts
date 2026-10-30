// Supplier-only validation gateway. Auth still owns signup, duplicates, email
// confirmation, sessions, hashing, and storage. Also used as Before User Created
// hook so callers cannot bypass this gateway by calling Auth signup directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { emailError, passwordError } from "../_shared/supplier_registration_validation.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function proofKey() {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Supplier signup validation is not configured.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signupProof(email: string) {
  const expires = Math.floor(Date.now() / 1000) + 60;
  const signature = await crypto.subtle.sign("HMAC", await proofKey(), new TextEncoder().encode(`supplier-signup:${email}:${expires}`));
  return { expires, signature: Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("") };
}

async function validProof(email: string, proof: { expires?: number; signature?: string } | undefined) {
  const now = Math.floor(Date.now() / 1000);
  if (!proof || !Number.isInteger(proof.expires) || proof.expires! < now || proof.expires! > now + 60 ||
      typeof proof.signature !== "string" || !/^[a-f0-9]{64}$/.test(proof.signature)) return false;
  const bytes = Uint8Array.from(proof.signature.match(/../g)!, byte => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", await proofKey(), bytes, new TextEncoder().encode(`supplier-signup:${email}:${proof.expires}`));
}

type BeforeCreateEvent = {
  user?: {
    email?: string;
    user_metadata?: {
      role?: string;
      supplier_signup_validation?: { expires?: number; signature?: string };
    };
  };
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: { message: "Method not allowed." } }, 405);
  try {
    if (req.headers.has("webhook-id")) {
      // Standard Webhooks authenticates the Auth service before inspecting users.
      const secret = Deno.env.get("SUPPLIER_SIGNUP_HOOK_SECRET")?.replace("v1,whsec_", "");
      if (!secret) return json({ error: { message: "Supplier signup hook is not configured." } }, 503);
      let event: BeforeCreateEvent;
      try { event = new Webhook(secret).verify(await req.text(), Object.fromEntries(req.headers)) as BeforeCreateEvent; }
      catch { return json({ error: { message: "Invalid hook signature." } }, 401); }
      const user = event.user;
      // Staff creation and existing account flows retain their own policies.
      if (user?.user_metadata?.role !== "Supplier") return json({});
      const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
      if (emailError(email) || !await validProof(email, user.user_metadata.supplier_signup_validation)) {
        return json({ error: { http_code: 400, message: "Please register through the Supplier Registration form." } });
      }
      return json({});
    }

    const { email: rawEmail, password, confirm_password } = await req.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
    const message = emailError(email) || passwordError(password) ||
      (password !== confirm_password ? "Passwords do not match." : "");
    if (message) return json({ error: { message, status: 400 } }, 400);

    // Proof is forwarded directly to Auth, never returned before user creation.
    // It binds the server's validation to this email and expires after a minute.
    const proof = await signupProof(email.toLowerCase());
    const auth = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await auth.auth.signUp({
      email, password,
      options: { data: { role: "Supplier", supplier_signup_validation: proof } },
    });
    if (error) return json({ error: { message: error.message, status: error.status } }, error.status || 400);
    // With email confirmation on, signUp returns no session, so the browser has
    // no JWT for upload-registration-files. Issue a short-lived token bound to
    // this new user id instead (verified with the same HMAC key there).
    let upload_token: { expires: number; signature: string } | undefined;
    if (data.user?.id) {
      const expires = Math.floor(Date.now() / 1000) + 30 * 60;
      const sig = await crypto.subtle.sign("HMAC", await proofKey(), new TextEncoder().encode(`registration-upload:${data.user.id}:${expires}`));
      upload_token = { expires, signature: Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("") };
    }
    return json({ data, upload_token });
  } catch {
    return json({ error: { message: "Supplier registration could not be completed. Please try again.", status: 500 } }, 500);
  }
});
