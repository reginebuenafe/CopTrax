// _shared/contract_signing_helpers.ts
// -----------------------------------------------------------------------------
// Shared helpers used by BOTH `sign-contract` (Supplier signing step) and
// `approve-contract` (Business Owner approval/activation step), so the
// e-signature fetch logic and caller-IP extraction are never duplicated
// across the two-stage contract signing flow.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
export type Admin = ReturnType<typeof createClient<any, any>>;

/** Extract the caller's IP address from common proxy headers. */
export function callerIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-real-ip")
      ?? "unknown";
}

/**
 * Fetch a user's stored e-signature image bytes.
 * Returns { bytes, sourceUrl } or null if no signature is registered.
 * Note: file_uploads.file_url actually stores the object path within the
 * 'documents' storage bucket (see upload-registration-files), not an HTTP URL.
 */
export async function fetchSignatureBytes(
  admin: Admin,
  userId: string,
): Promise<{ bytes: Uint8Array; sourceUrl: string } | null> {
  const { data: verifyRow } = await admin
    .from("user_verify")
    .select("esign_file_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!verifyRow?.esign_file_id) return null;

  const { data: fileRow } = await admin
    .from("file_uploads")
    .select("file_url")
    .eq("file_id", verifyRow.esign_file_id)
    .maybeSingle();

  if (!fileRow?.file_url) return null;

  const stored = fileRow.file_url as string;
  const storagePath = stored.startsWith("documents/")
    ? stored.substring("documents/".length)
    : stored;

  // Download via service role (bypasses RLS).
  const { data: blob, error } = await admin.storage
    .from("documents").download(storagePath);
  if (error || !blob) return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, sourceUrl: storagePath };
}
