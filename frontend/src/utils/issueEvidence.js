// Shared evidence-photo upload helper for the Weighing Staff "Weight
// Correction" and Laboratory Staff "MC Correction" Report Issue flows.
//
// Reuses the EXACT SAME private-storage + metadata-row pattern already used
// by the Supplier signature upload in AccountSettingsPage.jsx: a direct
// client-side upload to the existing `documents` bucket (private; RLS scopes
// read/write to the uploader's own folder, with a BO-read-all policy for
// review), followed by a `file_uploads` row (so BO can look up file_name/
// file_url for a signed preview later). No new bucket or storage policy is
// needed — `documents_insert_own`/`documents_select_own`/`documents_select_bo`
// already cover this since the path's first folder segment is the
// authenticated user's own id.
import { supabase } from "../lib/supabase";

const MAX_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024; // matches the bucket's own 10 MB limit

export function validateEvidenceFile(file) {
  if (!file) return "Please choose a photo.";
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > MAX_EVIDENCE_FILE_SIZE) return "Image is too large (max 10 MB).";
  return null;
}

// slug: short filename hint, e.g. "weight-evidence" | "receipt" | "apparatus-reading"
export async function uploadEvidencePhoto(userId, file, slug) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/issue-evidence/${Date.now()}-${slug}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: fileRow, error: fileErr } = await supabase.from("file_uploads").insert({
    uploaded_by: userId,
    file_category: "Receipt",
    file_name: file.name,
    file_url: path,
    file_size: file.size,
  }).select("file_id").single();
  if (fileErr) throw new Error(fileErr.message);

  return fileRow.file_id;
}
