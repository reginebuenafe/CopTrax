// approve-contract/index.ts
// -----------------------------------------------------------------------------
// Business Owner Contract Approval & Activation — the second, mandatory,
// explicit step of the two-stage signing flow (see sign-contract/index.ts for
// the Supplier-facing first step).
//
// Called ONLY by the Business Owner, from the "Approve & Sign Contract"
// action, after they have opened the specific contract for review AND
// confirmed the authorization dialog:
//   "I confirm that I have reviewed the contract terms and authorize my
//    signature to be applied to this contract."
//
// SECURITY GUARANTEES:
//   1. Caller identity is proven by their authenticated Supabase Auth JWT,
//      and MUST equal contracts.business_owner_id — the Supplier or any
//      other role can never trigger this action (403 otherwise).
//   2. The contract MUST currently be 'Pending Owner Review' — this
//      function NEVER activates a contract the Supplier hasn't signed yet,
//      and can never be invoked twice: the final UPDATE is conditioned on
//      the row still being 'Pending Owner Review' at that instant, so a
//      duplicate/concurrent request cannot double-process the approval.
//   3. `bo_reviewed_at` on the contract MUST already be set (the Business
//      Owner must have actually opened this specific contract for review
//      before this endpoint will accept an approval) — enforced here on
//      the backend, not merely by disabling a button in the UI.
//   4. `confirmed: true` MUST be present in the request body — this
//      represents the explicit confirmation dialog the BO must accept;
//      there is no way to activate a contract without it.
//   5. The contract terms are re-canonicalised and re-hashed exactly as in
//      sign-contract — if the recomputed hash doesn't match the hash the
//      Supplier already signed against, approval is refused. Both parties
//      are guaranteed to be approving/have approved the exact same terms.
//   6. Only on success: the Business Owner's signature is embedded into the
//      final PDF (alongside the Supplier's, already applied in step one),
//      a second immutable contract_signatures audit row is recorded for the
//      Business Owner, activation_date is set (which drives the existing
//      due_date = activation_date + 1 month + 1 day trigger), and the
//      contract becomes 'Active'.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ContractTerms,
  computeContractHash,
} from "../_shared/contract_hash.ts";
import { renderContractPDF } from "../_shared/contract_pdf.ts";
import { sendEmail } from "../_shared/send_email.ts";
import { priceToWords } from "../_shared/price_to_words.ts";
import { callerIP, fetchSignatureBytes } from "../_shared/contract_signing_helpers.ts";

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
    const confirmed:   boolean            = body?.confirmed === true;

    if (!contract_id) return json({ error: "contract_id is required" }, 400);
    if (!confirmed) {
      return json({
        error: "You must confirm the authorization dialog to approve and sign this contract.",
      }, 400);
    }

    // ── 3. Load contract; verify caller IS the Business Owner ────────────────
    const { data: contract, error: contractErr } = await admin
      .from("contracts")
      .select(`
        contract_id, contract_number, status, supplier_id, business_owner_id,
        contract_hash, contract_terms_snapshot, contract_document_url,
        negotiated_price_per_kg, contracted_tons, due_date, delivery_location,
        special_notes, bo_reviewed_at, supplier_authorized_at
      `)
      .eq("contract_id", contract_id)
      .single();

    if (contractErr || !contract) return json({ error: "Contract not found" }, 404);

    // Only the contract's actual Business Owner may approve it — never the
    // Supplier or any other role.
    if (contract.business_owner_id !== caller.id) {
      return json({ error: "Only the Business Owner of this contract can approve and sign it." }, 403);
    }

    if (contract.status !== "Pending Owner Review") {
      return json({
        error: `This contract is not awaiting your approval (current status: ${contract.status}).`,
      }, 400);
    }

    // The Business Owner must have actually opened this specific contract
    // for review before an approval can be accepted — validated here on the
    // backend, not only via a disabled button in the UI.
    if (!contract.bo_reviewed_at) {
      return json({
        error: "You must open and review this contract before you can approve and sign it.",
      }, 400);
    }

    if (!contract.contract_hash || !contract.contract_terms_snapshot) {
      return json({ error: "This contract has no generated document to approve." }, 400);
    }

    // ── 4. Tamper detection — same canonical hash both parties are signing ──
    const snapshotTerms = contract.contract_terms_snapshot as unknown as ContractTerms;
    const recomputedHash = await computeContractHash(snapshotTerms);

    if (recomputedHash !== contract.contract_hash) {
      return json({
        error: "Contract integrity check failed. The stored terms do not match the recorded hash. Approval is refused.",
      }, 409);
    }

    // ── 5. Load participant profiles + both signature images ────────────────
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
      return json({ error: "The Supplier's signature could not be found." }, 400);
    }

    const boSig = await fetchSignatureBytes(admin, bo.user_id as string);
    if (!boSig) {
      return json({
        error: "Your registered e-signature could not be found. Please upload one in Account Settings.",
      }, 400);
    }

    // ── 6. Render final signed PDF (both signatures) ─────────────────────────
    const now = new Date();
    const nowIso = now.toISOString();
    const today  = nowIso.slice(0, 10);

    const dueDateText = fmtDate(
      new Date(now.getFullYear(), now.getMonth() + 1, now.getDate() + 1).toISOString(),
    );

    const priceWords = priceToWords(Number(snapshotTerms.negotiated_price_per_kg));

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
      business_owner_signature_png: boSig.bytes,
      supplier_signed_at:           (contract.supplier_authorized_at as string) ?? nowIso,
      business_owner_signed_at:     nowIso,
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

    // ── 7. Duplicate guard: refuse if a BO signature row already exists ──────
    const { data: existingBoSig } = await admin
      .from("contract_signatures")
      .select("signature_id")
      .eq("contract_id", contract_id)
      .eq("signer_role", "Business Owner")
      .maybeSingle();

    if (existingBoSig) {
      return json({ error: "This contract has already been approved and signed." }, 409);
    }

    // ── 8. Atomically activate — only if still Pending Owner Review ─────────
    // This is the authoritative guard against duplicate/concurrent approval:
    // if two requests race, only one UPDATE will match a row (status is
    // checked in the same statement as the write) and the other gets 0 rows.
    const { data: updatedRows, error: updateErr } = await admin
      .from("contracts")
      .update({
        status:                "Active",
        activation_date:       today,   // DB trigger computes due_date
        bo_signed_at:          nowIso,
        contract_document_url: signedPath,
      })
      .eq("contract_id", contract_id)
      .eq("status", "Pending Owner Review")
      .select("contract_id");

    if (updateErr) return json({ error: `Contract update failed: ${updateErr.message}` }, 500);
    if (!updatedRows || updatedRows.length === 0) {
      return json({
        error: "This contract is no longer awaiting your approval (it may have already been approved).",
      }, 409);
    }

    // ── 9. Insert immutable audit row for the Business Owner's approval ─────
    const ipAddress = callerIP(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const { data: boVerify } = await admin
      .from("user_verify")
      .select("esign_file_id")
      .eq("user_id", contract.business_owner_id).maybeSingle();

    const { error: sigInsertErr } = await admin
      .from("contract_signatures").insert({
        contract_id,
        signer_id:           contract.business_owner_id,
        signer_role:         "Business Owner",
        esignature_file_id:  boVerify?.esign_file_id ?? null,
        signature_order:     2,
        signed_at:           nowIso,
        signature_hash:      contract.contract_hash,
        ip_address:          ipAddress,
        user_agent:          userAgent,
        signature_image_url: boSig.sourceUrl,
      });
    if (sigInsertErr) {
      // The contract is already Active at this point; log but don't fail the
      // request over the audit row — the PDF and activation are already the
      // source of truth for this approval.
      console.error("approve-contract: BO signature audit insert failed:", sigInsertErr.message);
    }

    // ── 10. Notifications ─────────────────────────────────────────────────────
    await admin.from("notifications").insert([
      {
        user_id:             contract.supplier_id as string,
        notification_type:   "Contract Signed",
        message:             `Contract ${contract.contract_number} has been approved by NERC Copra Trading and is now Active.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
      {
        user_id:             contract.business_owner_id as string,
        notification_type:   "Contract Signed",
        message:             `You approved and signed contract ${contract.contract_number}. It is now Active.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
    ]);

    // Email the Supplier that the contract is now Active.
    await sendEmail({
      to:      supplier.email as string,
      subject: `Contract ${contract.contract_number} is now Active`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3E2723;">
          <div style="background: #2E7D32; padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">NERC Copra Trading</h1>
            <p style="color: #C8E6C9; margin: 4px 0 0; font-size: 13px;">CopTrax Supplier Portal</p>
          </div>
          <div style="background: #FFFEFB; padding: 32px; border: 1px solid #DCCDB4; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; font-weight: 600; margin-top: 0;">Hi ${supplier.first_name},</p>
            <p style="line-height: 1.6;">
              NERC Copra Trading has reviewed and approved contract
              <strong>${contract.contract_number}</strong>. It is now
              <strong style="color: #2E7D32;">Active</strong> and deliveries can begin.
            </p>
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
      status:                 "Active",
      activation_date:        today,
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
