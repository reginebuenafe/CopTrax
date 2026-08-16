// docuseal-webhook/index.ts
// Receives DocuSeal webhook events.
// On `form.completed` (all parties signed):
//   - Sets activation_date = today  (DB trigger computes due_date = +1 month +1 day)
//   - Updates contract status to Active
//   - Records the Business Owner signature (Supplier was recorded earlier)
//   - Notifies both parties

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DOCUSEAL_WEBHOOK_SECRET   = Deno.env.get("DOCUSEAL_WEBHOOK_SECRET") ?? "";

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

async function verifyDocusealSignature(rawBody: string, header: string | null) {
  if (!DOCUSEAL_WEBHOOK_SECRET || !header) return false;

  const [timestamp, receivedSignature] = header.split(".", 2);
  const timestampNumber = Number(timestamp);
  if (!timestamp || !receivedSignature || !Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(DOCUSEAL_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expectedSignature = Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSignature.length !== receivedSignature.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    difference |= expectedSignature.charCodeAt(index) ^ receivedSignature.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const rawBody = await req.text();
    const signatureIsValid = await verifyDocusealSignature(
      rawBody,
      req.headers.get("X-Docuseal-Signature"),
    );
    if (!signatureIsValid) return json({ error: "Invalid DocuSeal webhook signature" }, 401);

    const payload = JSON.parse(rawBody);

    // DocuSeal sends: { event_type: "form.completed", data: { submission: { id, ... } } }
    // and also individual submitter events like "form.viewed", "form.started"
    const eventType    = payload.event_type as string;
    const submissionId = payload.data?.submission?.id ?? payload.data?.id;

    if (!submissionId) return json({ ok: true }); // Not a submission event we care about

    if (eventType === "form.completed") {
      // All parties have signed — activate the contract
      const { data: contract } = await admin
        .from("contracts")
        .select("contract_id, contract_number, supplier_id, business_owner_id, status, supplier_authorized_at, bo_signed_at, contract_document_url")
        .eq("docuseal_submission_id", String(submissionId))
        .single();

      if (!contract) return json({ error: "Contract not found for submission" }, 404);

      // Idempotency — ignore if already activated
      if (contract.status !== "Pending") return json({ ok: true, note: "Already processed" });
      if (!contract.supplier_authorized_at) {
        return json({ error: "Supplier signature must be recorded before BO completion" }, 409);
      }

      const now = new Date().toISOString();
      const today = new Date().toISOString().slice(0, 10);

      // The Supplier row was recorded during authorization. Insert the BO row
      // only if it does not already exist so webhook retries remain idempotent.
      const { data: existingBoSignature } = await admin
        .from("contract_signatures")
        .select("signature_id")
        .eq("contract_id", contract.contract_id)
        .eq("signer_id", contract.business_owner_id)
        .maybeSingle();

      if (!existingBoSignature) {
        const { error: signatureError } = await admin.from("contract_signatures").insert({
          contract_id:     contract.contract_id,
          signer_id:       contract.business_owner_id,
          signer_role:     "Business Owner",
          signature_order: 2,
          signed_at:       now,
        });
        if (signatureError) {
          return json({ error: `BO signature audit failed: ${signatureError.message}` }, 500);
        }
      }

      // Activate only after the audit row is safely present. The activation
      // trigger computes due_date from activation_date.
      const { error: activationError } = await admin.from("contracts").update({
        activation_date: today,
        signing_date: today,
        bo_signed_at: now,
        contract_document_url:
          payload.data?.submission?.combined_document_url ??
          payload.data?.submission?.documents?.[0]?.url ??
          payload.data?.documents?.[0]?.url ??
          contract.contract_document_url,
        status: "Active",
      }).eq("contract_id", contract.contract_id);

      if (activationError) {
        return json({ error: `Contract activation failed: ${activationError.message}` }, 500);
      }

      // Notify both parties
      await admin.from("notifications").insert([
        {
          user_id:             contract.supplier_id,
          notification_type:   "Contract Activated",
          message:             `Contract ${contract.contract_number} has been signed and is now Active. Deliveries can now be recorded.`,
          related_entity_type: "contracts",
          related_entity_id:   contract.contract_id,
        },
        {
          user_id:             contract.business_owner_id,
          notification_type:   "Contract Activated",
          message:             `Contract ${contract.contract_number} has been fully signed and is now Active.`,
          related_entity_type: "contracts",
          related_entity_id:   contract.contract_id,
        },
      ]);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
