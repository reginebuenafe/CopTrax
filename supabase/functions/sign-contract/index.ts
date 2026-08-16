// sign-contract/index.ts
// Supplier authorization → first-stage programmatic signing (REQ-4.3).
//
// Called by the Supplier from the "Review & Sign Contract" modal after they
// tick the authorization checkbox. Flow:
//   1. Verify caller is the contract's Supplier.
//   2. Verify `authorized: true` in the request body (checkbox confirmation).
//   3. Fetch supplier's stored e-signature from user_verify.esign_file_id.
//   4. Apply only the Supplier signature to the pending DocuSeal submitter.
//   5. Record the Supplier audit row and authorization timestamp.
//   6. Leave the submission and contract Pending for the Business Owner.
//   7. Notify both parties. DocuSeal's form.completed webhook activates the
//      contract only after the Business Owner completes the second signature.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DOCUSEAL_API_KEY          = Deno.env.get("DOCUSEAL_API_KEY") ?? "";
const REMOVE_BG_API_KEY         = Deno.env.get("REMOVE_BG_API_KEY") ?? "";
const DOCUSEAL_API_BASE         = "https://api.docuseal.com";

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

async function fetchSignatureDataUrl(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
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

  try {
    const rawRes = await fetch(fileRow.file_url, {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!rawRes.ok) return null;

    const rawBytes = new Uint8Array(await rawRes.arrayBuffer());
    let sigBytes = rawBytes;
    let sigMime  = rawRes.headers.get("content-type") ?? "image/png";

    // Non-fatal: try to remove background for a cleaner signature
    if (REMOVE_BG_API_KEY) {
      try {
        const fd = new FormData();
        fd.append("image_file", new Blob([rawBytes]), "signature.png");
        fd.append("size", "auto");
        const bgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
          method:  "POST",
          headers: { "X-Api-Key": REMOVE_BG_API_KEY },
          body:    fd,
        });
        if (bgRes.ok) {
          sigBytes = new Uint8Array(await bgRes.arrayBuffer());
          sigMime  = "image/png";
        }
      } catch (_e) { /* keep raw */ }
    }

    const b64 = btoa(sigBytes.reduce((s, b) => s + String.fromCharCode(b), ""));
    return `data:${sigMime};base64,${b64}`;
  } catch (_e) {
    return null;
  }
}

async function findSignerRoleId(
  admin: ReturnType<typeof createClient>,
  roleName: "Supplier" | "Business Owner",
): Promise<string | null> {
  const { data } = await admin.from("roles").select("role_id").eq("role_name", roleName).single();
  return (data?.role_id as string | undefined) ?? null;
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
        docuseal_submission_id, docuseal_bo_slug, docuseal_supplier_slug,
        supplier_authorized_at
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
    if (!contract.docuseal_submission_id) {
      return json({ error: "This contract has no DocuSeal submission. Ask the Business Owner to send it again." }, 400);
    }
    if (contract.supplier_authorized_at) {
      return json({
        success: true,
        contract_id,
        supplier_authorized_at: contract.supplier_authorized_at,
        awaiting_business_owner: true,
        already_signed: true,
      });
    }

    // ── 4. Fetch stored e-signatures ─────────────────────────────────────────
    const supplierSigDataUrl = await fetchSignatureDataUrl(admin, contract.supplier_id as string);
    if (!supplierSigDataUrl) {
      return json({
        error: "Your registered e-signature could not be found. Please contact support.",
      }, 400);
    }

    // ── 5. Apply the Supplier signature without completing the BO session ───
    // docuseal_bo_slug is repurposed by generate-contract to hold the SUBMITTER id
    const submitterId = contract.docuseal_bo_slug;
    if (!submitterId) {
      return json({ error: "DocuSeal submitter ID missing on contract." }, 500);
    }

    const values: Record<string, string> = { supplier_signature: supplierSigDataUrl };

    const dsRes = await fetch(`${DOCUSEAL_API_BASE}/submitters/${submitterId}`, {
      method:  "PUT",
      headers: { "X-Auth-Token": DOCUSEAL_API_KEY, "Content-Type": "application/json" },
      body:    JSON.stringify({ values }),
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      return json({ error: `DocuSeal signing failed: ${errText}` }, 502);
    }

    await dsRes.json();

    // ── 6. Insert audit rows in contract_signatures ──────────────────────────
    const now = new Date().toISOString();

    const { data: verifyRow } = await admin
      .from("user_verify")
      .select("esign_file_id")
      .eq("user_id", contract.supplier_id)
      .maybeSingle();

    const { data: existingSupplierSignature } = await admin
      .from("contract_signatures")
      .select("signature_id")
      .eq("contract_id", contract_id)
      .eq("signer_id", contract.supplier_id)
      .maybeSingle();

    if (!existingSupplierSignature) {
      const { error: signatureError } = await admin.from("contract_signatures").insert({
        contract_id,
        signer_id:          contract.supplier_id,
        signer_role:        "Supplier",
        esignature_file_id: verifyRow?.esign_file_id ?? null,
        signature_order:    1,
        signed_at:          now,
      });
      if (signatureError) {
        return json({ error: `Supplier signature audit failed: ${signatureError.message}` }, 500);
      }
    }

    // Keep the contract Pending. Activation is reserved for form.completed.
    const { error: updateErr } = await admin.from("contracts").update({
      supplier_authorized_at: now,
    }).eq("contract_id", contract_id);

    if (updateErr) return json({ error: `DB update failed: ${updateErr.message}` }, 500);

    // ── 7. Notifications ─────────────────────────────────────────────────────
    await admin.from("notifications").insert([
      {
        user_id:             contract.supplier_id as string,
        notification_type:   "Contract Signed",
        message:             `You've signed contract ${contract.contract_number}. It is awaiting the Business Owner's signature.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
      {
        user_id:             contract.business_owner_id as string,
        notification_type:   "Contract Signed",
        message:             `The Supplier signed contract ${contract.contract_number}. Review and sign it to activate the contract.`,
        related_entity_type: "contracts",
        related_entity_id:   contract_id,
      },
    ]);

    return json({
      success:              true,
      contract_id,
      supplier_authorized_at: now,
      awaiting_business_owner: true,
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
