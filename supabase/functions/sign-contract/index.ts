// sign-contract/index.ts
// -----------------------------------------------------------------------------
// Cryptographic Signature Binding — Contract Signing (Supplier step only)
//
// Called by the Supplier from the "Review & Sign Contract" modal after they
// tick the authorization checkbox.
//
// Security guarantees produced by this handler:
//   1. Signer identity is proven by their authenticated Supabase Auth JWT.
//   2. The current contract terms are re-canonicalised and re-hashed. If that
//      hash does not match the hash stored on the row (created by
//      generate-contract), signing is refused — the terms were tampered with.
//   3. A contract_signatures audit row records the Supplier's signature:
//        signer_id, signer_role, signed_at, ip_address, user_agent,
//        signature_hash (== agreed contract hash), signature_image_url.
//      That row is made immutable by a DB trigger (see migration 017).
//   4. ONLY the Supplier's signature image is embedded into the interim
//      signed PDF at this stage — the Business Owner's signature is never
//      applied automatically here.
//   5. The contract row transitions to 'Pending Owner Review' — NOT Active.
//      Activation only happens when the Business Owner explicitly reviews
//      and approves via the separate `approve-contract` Edge Function; see
//      migration 20260913000057_bo_contract_approval_flow.sql.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ContractTerms,
  computeContractHash,
} from "../_shared/contract_hash.ts";
import { renderContractPDF } from "../_shared/contract_pdf.ts";
import { sendEmail } from "../_shared/send_email.ts";
import { callerIP, fetchSignatureBytes } from "../_shared/contract_signing_helpers.ts";
import { priceToWords } from "../_shared/price_to_words.ts";

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

    // SECURITY: the Business Owner's signature is NEVER fetched or embedded
    // here. Only the Supplier's signature is applied at this stage. The BO
    // must explicitly review and approve via `approve-contract` before their
    // signature is ever applied and the contract can become Active.

    // ── 6. Render interim signed PDF (Supplier signature only) ───────────────
    const now = new Date();
    const nowIso = now.toISOString();
    const today  = nowIso.slice(0, 10);

    // due_date is not yet known — activation (and due_date) only happen once
    // the Business Owner approves via approve-contract.
    const dueDateText = "one month and one day from Business Owner approval";

    // Price words = price per kilogram in words, NOT the total contract value.
    const priceWords  = priceToWords(Number(snapshotTerms.negotiated_price_per_kg));

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
      business_owner_signature_png: null,
      supplier_signed_at:           nowIso,
      // business_owner_signed_at is intentionally omitted — the BO has not
      // performed an explicit signing action in this request, and never
      // will as a side-effect of the Supplier's action.
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

    // ── 8. Move to Pending Owner Review (NOT Active) ─────────────────────────
    // Guard the transition atomically: only succeeds if the contract is still
    // 'Pending' at this exact moment, preventing a double-submit/race from
    // processing the Supplier's signature twice.
    const { data: updatedRows, error: updateErr } = await admin
      .from("contracts")
      .update({
        status:                 "Pending Owner Review",
        supplier_authorized_at: nowIso,
        signing_date:           today,
        contract_document_url:  signedPath,
      })
      .eq("contract_id", contract_id)
      .eq("status", "Pending")
      .select("contract_id");

    if (updateErr) return json({ error: `Contract update failed: ${updateErr.message}` }, 500);
    if (!updatedRows || updatedRows.length === 0) {
      return json({
        error: "This contract is no longer awaiting your signature (it may have already been signed).",
      }, 409);
    }

    // ── 9. Notifications ─────────────────────────────────────────────────────
    await admin.from("notifications").insert([
      {
        user_id:             contract.supplier_id as string,
        notification_type:   "Contract Signed",
        message:             `You've signed contract ${contract.contract_number}. It is now awaiting the Business Owner's review and approval.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
      {
        user_id:             contract.business_owner_id as string,
        notification_type:   "Contract Signed",
        message:             `Supplier ${supplier.first_name} ${supplier.last_name} has signed contract ${contract.contract_number}. Please open and review it to approve and activate.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
    ]);

    // Send email to Business Owner notifying that supplier has signed and
    // their review + explicit approval is now required.
    await sendEmail({
      to:      bo.email as string,
      subject: `Contract ${contract.contract_number} signed by Supplier — your review is required`,
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
              contract <strong>${contract.contract_number}</strong>. It is now
              <strong style="color: #B45309;">Pending your review</strong> — please open the
              contract, review its terms, and explicitly approve &amp; sign it before it can
              become Active.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="https://coptrax.onrender.com/dashboard/owner/contracts"
                 style="background: #2E7D32; color: #fff; text-decoration: none;
                        padding: 14px 32px; border-radius: 8px; font-weight: 700;
                        font-size: 15px; display: inline-block;">
                Review Contract
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
              It is now <strong style="color: #B45309;">pending the Business Owner's review and approval</strong>.
              You'll be notified once it becomes Active.
            </p>
            <p style="line-height: 1.6;">You can view your signed contract in CopTrax.</p>
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
      status:                 "Pending Owner Review",
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
