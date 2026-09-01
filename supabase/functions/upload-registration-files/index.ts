// upload-registration-files/index.ts
// Called during Supplier self-registration immediately after auth.signUp().
// Accepts base64-encoded files (Gov ID photo, selfie-with-ID, e-signature photo),
// uploads them to the 'documents' storage bucket using the service-role key
// (bypasses RLS — required because the newly-created user may not have a confirmed
// session yet if email confirmation is enabled), inserts file_uploads rows,
// creates the user_verify record, and updates the users profile row.
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
      user_id,
      first_name,
      last_name,
      phone,
      address,
      gov_id_type,      // e.g. "Driver's License"
      gov_id_data,      // base64 data URL
      face_id_data,     // base64 data URL
      esign_data,       // base64 data URL
      bank_name,        // NEW: for Xendit disbursements
      account_name,     // NEW
      account_number,   // NEW
    } = await req.json();

    if (!user_id || !gov_id_data || !face_id_data || !esign_data) {
      return json({ error: "user_id, gov_id_data, face_id_data, and esign_data are required" }, 400);
    }
    if (!bank_name || !account_name || !account_number) {
      return json({ error: "bank_name, account_name, and account_number are required" }, 400);
    }

    // ── Caller-identity check ─────────────────────────────────────────────────
    // If the client sent a JWT (which supabase.functions.invoke does when a
    // session exists), verify that the JWT subject matches the user_id being
    // submitted. This prevents any other caller from overwriting another user's
    // profile/documents/bank row by guessing a UUID.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwtMatch  = authHeader.match(/^Bearer\s+(.+)$/i);
    if (jwtMatch) {
      const anonOrUserClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user: jwtUser }, error: jwtErr } = await anonOrUserClient.auth.getUser(jwtMatch[1]);
      if (jwtErr || !jwtUser) {
        return json({ error: "Invalid or expired authentication token." }, 401);
      }
      if (jwtUser.id !== user_id) {
        return json({ error: "Unauthorized: token subject does not match the submitted user_id." }, 403);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the user exists in public.users AND is still Pending Verification
    // (prevents overwriting an already-approved or rejected supplier's data)
    const { data: userRow, error: userErr } = await admin
      .from("users")
      .select("user_id, account_status")
      .eq("user_id", user_id)
      .eq("account_status", "Pending Verification")
      .single();

    if (userErr || !userRow) {
      // Trigger may be slightly delayed — wait briefly and retry once
      await new Promise(r => setTimeout(r, 1500));
      const { data: retryRow, error: retryErr } = await admin
        .from("users")
        .select("user_id, account_status")
        .eq("user_id", user_id)
        .eq("account_status", "Pending Verification")
        .single();
      if (retryErr || !retryRow) {
        return json({ error: "User profile not found or account is not in Pending Verification status. Please try again." }, 404);
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
          .update({ gov_id_file_id: govIdFileId, esign_file_id: esignFileId, verify_status: "Pending" })
          .eq("user_id", user_id);
        if (updateErr) {
          return json({ error: `user_verify update failed: ${updateErr.message}` }, 500);
        }
      } else {
        return json({ error: `user_verify insert failed: ${verifyErr.message} (code: ${verifyErr.code})` }, 500);
      }
    }

    // Seed the supplier's bank account (used for Xendit disbursements).
    // Suppliers cannot self-edit this later — they must submit a
    // bank_change_requests row for the BO to approve.
    const { error: bankErr } = await admin.from("bank_accounts").insert({
      user_id,
      bank_name:      bank_name.trim(),
      account_name:   account_name.trim(),
      account_number: account_number.trim(),
    });

    if (bankErr && bankErr.code !== "23505") { // ignore duplicate on retry
      return json({ error: `bank_accounts insert failed: ${bankErr.message}` }, 500);
    }
    if (bankErr?.code === "23505") {
      // Retry / previous partial attempt — overwrite
      await admin.from("bank_accounts").update({
        bank_name:      bank_name.trim(),
        account_name:   account_name.trim(),
        account_number: account_number.trim(),
        updated_at:     new Date().toISOString(),
      }).eq("user_id", user_id);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
