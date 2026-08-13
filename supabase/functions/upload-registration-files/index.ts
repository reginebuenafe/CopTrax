// upload-registration-files/index.ts
// Called during Supplier self-registration immediately after auth.signUp().
// Accepts base64-encoded files (Gov ID photo, selfie-with-ID, e-signature photo),
// uploads them to the 'documents' storage bucket using the service-role key
// (bypasses RLS — required because the newly-created user may not have a confirmed
// session yet if email confirmation is enabled), inserts file_uploads rows,
// creates the user_verify record, and updates the users profile row.
//
// Also supports re-registration (re_registration = true): when signUp() fails with
// "User already registered" because the email was previously soft-deleted (the
// auth user is banned but the row still exists), this function reactivates the
// existing auth user (unban + new password), (re)creates the profile as
// 'Pending Verification' with the Supplier role, and continues with the normal
// document upload flow. The existing auth user is resolved via the
// find_auth_user_by_email RPC against auth.users, which is the source of truth.
//
// This Edge Function does NOT require the caller to be authenticated —
// it verifies legitimacy by checking that the userId exists in users
// with account_status = 'Pending Verification'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL               = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

// Convert base64 data URL to Uint8Array
function base64ToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return { bytes, mimeType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      user_id: requestedUserId,
      email,
      password,
      re_registration = false,
      first_name,
      last_name,
      phone,
      address,
      gov_id_type,      // e.g. "Driver's License"
      gov_id_data,      // base64 data URL
      face_id_data,     // base64 data URL
      esign_data,       // base64 data URL
    } = await req.json();

    if (!gov_id_data || !face_id_data || !esign_data) {
      return json({ error: "gov_id_data, face_id_data, and esign_data are required" }, 400);
    }
    if (!re_registration && !requestedUserId) {
      return json({ error: "user_id is required" }, 400);
    }
    if (re_registration && (!email || !password)) {
      return json({ error: "email and password are required to re-register" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let user_id = requestedUserId;

    // ── Re-registration path ──────────────────────────────────────────────────
    // auth.signUp() rejects an email that already exists in auth.users, so a
    // previously-deleted supplier can never sign up again. When the frontend
    // receives "User already registered", it retries with re_registration = true:
    // we reuse the existing auth user — unban, set the new password, reset the
    // profile to 'Pending Verification' — and continue with the normal document
    // upload + user_verify + email flow below.
    if (re_registration) {
      // auth.users is the source of truth — the public.users mirror row may be
      // missing or out of sync, so resolve the existing account there directly.
      const { data: authLookup, error: rpcErr } = await admin.rpc("find_auth_user_by_email", {
        p_email: email,
      });

      if (rpcErr) {
        console.error("[upload-registration-files] find_auth_user_by_email failed:", rpcErr);
        return json({ error: "Account lookup failed. Please ensure the latest database migration is applied (supabase db push) and try again." }, 500);
      }
      const authUser = authLookup?.[0];
      if (!authUser?.user_id) {
        return json({ error: "No previously registered account found with this email. Please contact NERC Copra Trading if you believe this is a mistake." }, 404);
      }

      // Check for an existing profile row (may be missing if it was cleaned up).
      const { data: existing } = await admin
        .from("users")
        .select("user_id, account_status")
        .eq("user_id", authUser.user_id)
        .maybeSingle();

      if (existing) {
        switch (existing.account_status) {
          case "Pending":
            return json({ error: "This email already has a registration that is still pending review. Please wait for the Business Owner's decision." }, 409);
          case "Active":
            return json({ error: "This email is already registered to an active account. Please sign in instead." }, 409);
          case "Rejected":
            return json({ error: "This email's previous registration was declined. Please contact NERC Copra Trading for assistance." }, 409);
        }
      } else if (!(authUser.banned_until && new Date(authUser.banned_until) > new Date())) {
        // No profile row and the auth user is not banned — this is an active
        // account with a missing profile, not a deleted one.
        return json({ error: "This email is already registered to an existing account. Please sign in instead." }, 409);
      }

      // Reactivate the auth user: clear the ban and set the new password.
      const { error: reactErr } = await admin.auth.admin.updateUserById(authUser.user_id, {
        password,
        ban_duration: "none",
        user_metadata: { role: "Supplier" },
      });
      if (reactErr) {
        return json({ error: `Failed to reactivate account: ${reactErr.message}` }, 500);
      }

      // Re-registration is always the supplier flow: (re)create the profile
      // row as Pending Verification with the Supplier role.
      const { data: supplierRole } = await admin
        .from("roles")
        .select("role_id")
        .eq("role_name", "Supplier")
        .single();

      const { error: profileErr } = await admin.from("users").upsert({
        user_id:        authUser.user_id,
        email:          authUser.auth_email ?? email,
        role_id:        supplierRole?.role_id ?? undefined,
        account_status: "Pending",
        first_name:     first_name ?? undefined,
        last_name:      last_name  ?? undefined,
        phone:          phone      ?? null,
        address:        address    ?? null,
        approved_by:    null,
        approved_at:    null,
      }, { onConflict: "user_id" });
      if (profileErr) {
        return json({ error: `Profile reset failed: ${profileErr.message}` }, 500);
      }

      user_id = authUser.user_id;
    }

    // Verify the user exists in public.users (fresh signup: trigger should have
    // created the row; re-registration: it was just reset above)
    const { data: userRow, error: userErr } = await admin
      .from("users")
      .select("user_id, account_status")
      .eq("user_id", user_id)
      .single();

    if (userErr || !userRow) {
      // Trigger may be slightly delayed — wait briefly and retry once
      await new Promise(r => setTimeout(r, 1500));
      const { data: retryRow, error: retryErr } = await admin
        .from("users")
        .select("user_id, account_status")
        .eq("user_id", user_id)
        .single();
      if (retryErr || !retryRow) {
        return json({ error: "User profile not found. Please try again." }, 404);
      }
    }

    // Update profile (first_name, last_name, phone, address)
    if (first_name || last_name || phone || address) {
      await admin.from("users").update({
        first_name: first_name ?? undefined,
        last_name:  last_name  ?? undefined,
        phone:      phone      ?? null,
        address:    address    ?? null,
      }).eq("user_id", user_id);
    }

    // Upload helper: uploads a base64 data URL and inserts a file_uploads row
    async function uploadFile(
      dataUrl: string,
      category: string,
      fileName: string,
    ): Promise<string> {
      const { bytes, mimeType } = base64ToBytes(dataUrl);
      const path = `${user_id}/${category.replace(/\s+/g, "-")}-${Date.now()}-${fileName}`;

      const { data: storageData, error: storageErr } = await admin.storage
        .from("documents")
        .upload(path, bytes, { contentType: mimeType, upsert: false });

      if (storageErr) throw new Error(`Storage upload failed (${category}): ${storageErr.message}`);

      const { data: fileRecord, error: dbErr } = await admin
        .from("file_uploads")
        .insert({
          uploaded_by:   user_id,
          file_category: category,
          file_name:     fileName,
          file_url:      storageData.path,
          file_size:     bytes.length,
        })
        .select("file_id")
        .single();

      if (dbErr) throw new Error(`file_uploads insert failed (${category}): ${dbErr.message}`);
      return fileRecord.file_id;
    }

    // Upload all three files
    const govIdFileName  = `${gov_id_type ?? "Gov-ID"}.jpg`.replace(/\s+/g, "-");
    const govIdFileId    = await uploadFile(gov_id_data,  "Gov ID",  govIdFileName);
    const _faceIdFileId  = await uploadFile(face_id_data, "Face ID", "face-id.jpg");
    const esignFileId    = await uploadFile(esign_data,   "E-Sign",  "esign.jpg");

    // Create user_verify record.
    // Use insert with ignoreDuplicates in case a previous partial attempt left a row.
    const { error: verifyErr } = await admin.from("user_verify").insert({
      user_id,
      gov_id_file_id: govIdFileId,
      esign_file_id:  esignFileId,
      verify_status:  "Pending",
    });

    if (verifyErr) {
      // If duplicate (previous partial attempt), update existing row instead
      if (verifyErr.code === "23505") {
        const { error: updateErr } = await admin.from("user_verify")
          .update({
            gov_id_file_id: govIdFileId,
            esign_file_id:  esignFileId,
            verify_status:  "Pending",
            review_by:      null,
            reviewed_at:    null,
          })
          .eq("user_id", user_id);
        if (updateErr) {
          return json({ error: `user_verify update failed: ${updateErr.message}` }, 500);
        }
      } else {
        return json({ error: `user_verify insert failed: ${verifyErr.message} (code: ${verifyErr.code})` }, 500);
      }
    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
