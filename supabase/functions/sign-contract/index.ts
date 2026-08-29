// sign-contract/index.ts
// -----------------------------------------------------------------------------
// Cryptographic Signature Binding — Contract Signing
//
// Called by the Supplier from the "Review & Sign Contract" modal after they
// tick the authorization checkbox.
//
// Security guarantees produced by this handler:
//   1. Signer identity is proven by their authenticated Supabase Auth JWT.
//   2. The current contract terms are re-canonicalised and re-hashed. If that
//      hash does not match the hash stored on the row (created by
//      generate-contract), signing is refused — the terms were tampered with.
//   3. Each contract_signatures audit row records:
//        signer_id, signer_role, signed_at, ip_address, user_agent,
//        signature_hash (== agreed contract hash), signature_image_url.
//      That row is made immutable by a DB trigger (see migration 017).
//   4. The signature image(s) are embedded into a final signed PDF, which is
//      also fingerprinted by the same hash in a visible footer.
//   5. The contract row transitions to 'Active'; the DB trigger computes
//      due_date = activation_date + 1 month + 1 day.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ContractTerms,
  computeContractHash,
} from "../_shared/contract_hash.ts";
import { renderContractPDF } from "../_shared/contract_pdf.ts";
import { sendEmail } from "../_shared/send_email.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CONTRACT_BUCKET = "contracts";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long", day: "numeric", year: "numeric",
  });
}

/** Extract the caller's IP address from common proxy headers. */
function callerIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-real-ip")
      ?? "unknown";
}

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient<any, any>>;

/**
 * Fetch a user's stored e-signature image bytes.
 * Returns { bytes, sourceUrl } or null if no signature is registered.
 * Note: file_uploads.file_url actually stores the object path within the
 * 'documents' storage bucket (see upload-registration-files), not an HTTP URL.
 */
async function fetchSignatureBytes(
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Authenticate caller ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization token" }, 401);

    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: "Invalid token" }, 401);

    // ── 2. Parse and validate request body ───────────────────────────────────
    const body = await req.json();
    const contract_id: string | undefined = body?.contract_id;
    const authorized:  boolean            = body?.authorized === true;

    if (!contract_id) return json({ error: "contract_id is required" }, 400);
    if (!authorized) {
      return json({
        error: "You must confirm the authorization checkbox to sign this contract.",
      }, 400);
    }

    // ── 3. Load contract; verify caller IS the supplier ──────────────────────
    const { data: contract, error: contractErr } = await admin
      .from("contracts")
      .select(`
        contract_id, contract_number, status, supplier_id, business_owner_id,
        contract_hash, contract_terms_snapshot, contract_document_url,
        negotiated_price_per_kg, contracted_tons, due_date, delivery_location,
        special_notes
      `)
      .eq("contract_id", contract_id)
      .single();

    if (contractErr || !contract) return json({ error: "Contract not found" }, 404);
    if (contract.supplier_id !== caller.id) {
      return json({ error: "Only the contract's Supplier can sign this contract." }, 403);
    }
    if (contract.status !== "Pending") {
      return json({ error: `Contract is not Pending (current: ${contract.status})` }, 400);
    }
    if (!contract.contract_hash || !contract.contract_terms_snapshot) {
      return json({
        error: "This contract has no generated document yet. Ask the Business Owner to generate it first.",
      }, 400);
    }

    // ── 4. Tamper detection ──────────────────────────────────────────────────
    // Re-hash the exact snapshot the BO generated and confirm it still matches
    // the stored contract_hash. This catches DB tampering that would otherwise
    // silently change the contract terms out from under the signer.
    const snapshotTerms = contract.contract_terms_snapshot as unknown as ContractTerms;
    const recomputedHash = await computeContractHash(snapshotTerms);

    if (recomputedHash !== contract.contract_hash) {
      return json({
        error: "Contract integrity check failed. The stored terms do not match the recorded hash. Signing is refused.",
      }, 409);
    }

    // ── 5. Load participant profiles + supplier signature ────────────────────
    const [{ data: supplier }, { data: bo }] = await Promise.all([
      admin.from("users")
        .select("user_id, first_name, last_name, email, address")
        .eq("user_id", contract.supplier_id).single(),
      admin.from("users")
        .select("user_id, first_name, last_name, email")
        .eq("user_id", contract.business_owner_id).single(),
    ]);

    if (!supplier || !bo) return json({ error: "Participant profiles not found" }, 404);

    const supplierSig = await fetchSignatureBytes(admin, supplier.user_id as string);
    if (!supplierSig) {
      return json({
        error: "Your registered e-signature could not be found. Please upload one in Account Settings.",
      }, 400);
    }

    // Fetch BO signature image for VISUAL embedding in the PDF only.
    // This is NOT treated as the BO's legal signing action — the BO's image
    // is already on file from registration. A separate BO-signing step would
    // record the BO's explicit authorization. For now we only record the
    // Supplier's binding signature row.
    const boSigForPdf = await fetchSignatureBytes(admin, bo.user_id as string);

    // ── 6. Render final signed PDF ───────────────────────────────────────────
    const now = new Date();
    const nowIso = now.toISOString();
    const today  = nowIso.slice(0, 10);

    // due_date will be set by the DB trigger on activation, so at signing time
    // it may be null. Fall back to a computed placeholder if so.
    const dueDateText = contract.due_date
      ? fmtDate(contract.due_date as string)
      : fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate() + 1).toISOString());

    // Price words = price per kilogram in words, NOT the total contract value.
    const priceWords  = numberToWords(Math.round(Number(snapshotTerms.negotiated_price_per_kg)));

    const signedPdfBytes = await renderContractPDF({
      contract_number:              snapshotTerms.contract_number,
      date_str:                     fmtDate(snapshotTerms.created_at),
      supplier_name:                snapshotTerms.supplier_name,
      supplier_address:             snapshotTerms.supplier_address,
      contracted_tons:              snapshotTerms.contracted_tons,
      negotiated_price:             snapshotTerms.negotiated_price_per_kg,
      negotiated_price_words:       priceWords,
      due_date_text:                dueDateText,
      delivery_location:            snapshotTerms.delivery_location,
      special_notes:                snapshotTerms.special_notes,
      business_owner_name:          snapshotTerms.business_owner_name,
      contract_hash:                contract.contract_hash,
      supplier_signature_png:       supplierSig.bytes,
      business_owner_signature_png: boSigForPdf?.bytes ?? null,
      supplier_signed_at:           nowIso,
      // business_owner_signed_at is intentionally omitted — BO has not
      // performed an explicit signing action in this request.
    });

    const signedPath = `${contract.supplier_id}/${contract_id}/signed.pdf`;
    const { error: uploadErr } = await admin.storage
      .from(CONTRACT_BUCKET)
      .upload(signedPath, signedPdfBytes, {
        contentType: "application/pdf",
        upsert:       true,
      });
    if (uploadErr) {
      return json({ error: `Signed PDF upload failed: ${uploadErr.message}` }, 500);
    }

    // ── 7. Insert immutable audit row for the Supplier signing action ─────────
    // Only one row here: the Supplier. The BO's image is embedded in the PDF
    // for visual completeness but does NOT constitute a separate signing event.
    const ipAddress = callerIP(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const { data: supplierVerify } = await admin
      .from("user_verify")
      .select("esign_file_id")
      .eq("user_id", contract.supplier_id).maybeSingle();

    const { error: sigInsertErr } = await admin
      .from("contract_signatures").insert({
        contract_id,
        signer_id:           contract.supplier_id,
        signer_role:         "Supplier",
        esignature_file_id:  supplierVerify?.esign_file_id ?? null,
        signature_order:     1,
        signed_at:           nowIso,
        signature_hash:      contract.contract_hash,
        ip_address:          ipAddress,
        user_agent:          userAgent,
        signature_image_url: supplierSig.sourceUrl,
      });
    if (sigInsertErr) {
      return json({ error: `Signature record insert failed: ${sigInsertErr.message}` }, 500);
    }

    // ── 8. Activate contract ─────────────────────────────────────────────────
    const { error: updateErr } = await admin.from("contracts").update({
      status:                 "Active",
      activation_date:        today,     // DB trigger computes due_date
      signing_date:           today,
      supplier_authorized_at: nowIso,
      contract_document_url:  signedPath,
    }).eq("contract_id", contract_id);

    if (updateErr) return json({ error: `Contract update failed: ${updateErr.message}` }, 500);

    // ── 9. Notifications ─────────────────────────────────────────────────────
    await admin.from("notifications").insert([
      {
        user_id:             contract.supplier_id as string,
        notification_type:   "Contract Signed",
        message:             `You've signed contract ${contract.contract_number}. It is now Active.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
      {
        user_id:             contract.business_owner_id as string,
        notification_type:   "Contract Signed",
        message:             `Contract ${contract.contract_number} has been signed by the Supplier and is now Active.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
    ]);

    // Send email to Business Owner notifying that supplier has signed
    await sendEmail({
      to:      bo.email as string,
      subject: `Contract ${contract.contract_number} has been signed — now Active`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3E2723;">
          <div style="background: #2E7D32; padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">NERC Copra Trading</h1>
            <p style="color: #C8E6C9; margin: 4px 0 0; font-size: 13px;">CopTrax Admin Portal</p>
          </div>
          <div style="background: #FFFEFB; padding: 32px; border: 1px solid #DCCDB4; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; font-weight: 600; margin-top: 0;">Hi ${bo.first_name},</p>
            <p style="line-height: 1.6;">
              Supplier <strong>${supplier.first_name} ${supplier.last_name}</strong> has signed
              contract <strong>${contract.contract_number}</strong>. The contract is now
              <strong style="color: #2E7D32;">Active</strong> and deliveries can begin.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://coptrax.onrender.com/dashboard/owner/contracts"
                 style="background: #2E7D32; color: #fff; text-decoration: none;
                        padding: 14px 32px; border-radius: 8px; font-weight: 700;
                        font-size: 15px; display: inline-block;">
                View Contract
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #DCCDB4; margin: 24px 0;" />
            <p style="font-size: 12px; color: #A1887F; margin: 0;">
              This is an automated message from CopTrax — NERC Copra Trading's procurement system.
            </p>
          </div>
        </div>
      `,
    });

    // Send confirmation email to Supplier
    await sendEmail({
      to:      supplier.email as string,
      subject: `You've successfully signed Contract ${contract.contract_number}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3E2723;">
          <div style="background: #2E7D32; padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">NERC Copra Trading</h1>
            <p style="color: #C8E6C9; margin: 4px 0 0; font-size: 13px;">CopTrax Supplier Portal</p>
          </div>
          <div style="background: #FFFEFB; padding: 32px; border: 1px solid #DCCDB4; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; font-weight: 600; margin-top: 0;">Hi ${supplier.first_name},</p>
            <p style="line-height: 1.6;">
              You have successfully signed contract <strong>${contract.contract_number}</strong>.
              The contract is now <strong style="color: #2E7D32;">Active</strong>.
            </p>
            <p style="line-height: 1.6;">You can view and download your signed contract in CopTrax.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://coptrax.onrender.com/dashboard/supplier/contracts"
                 style="background: #2E7D32; color: #fff; text-decoration: none;
                        padding: 14px 32px; border-radius: 8px; font-weight: 700;
                        font-size: 15px; display: inline-block;">
                View My Contracts
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #DCCDB4; margin: 24px 0;" />
            <p style="font-size: 12px; color: #A1887F; margin: 0;">
              This is an automated message from CopTrax — NERC Copra Trading's procurement system.
            </p>
          </div>
        </div>
      `,
    });

    return json({
      success:                true,
      contract_id,
      contract_document_path: signedPath,
      contract_hash:          contract.contract_hash,
      activation_date:        today,
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ── Simple number-to-words helper for Philippine peso amounts ────────────────
function numberToWords(n: number): string {
  if (n === 0) return "Zero Pesos";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function chunk(num: number): string {
    if (num === 0) return "";
    if (num < 20)  return ones[num] + " ";
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "") + " ";
    return ones[Math.floor(num / 100)] + " Hundred " + chunk(num % 100);
  }

  let result = "";
  if (n >= 1_000_000) { result += chunk(Math.floor(n / 1_000_000)) + "Million "; n %= 1_000_000; }
  if (n >= 1_000)     { result += chunk(Math.floor(n / 1_000))     + "Thousand "; n %= 1_000; }
  if (n > 0)           result += chunk(n);

  return result.trim() + " Pesos";
}
