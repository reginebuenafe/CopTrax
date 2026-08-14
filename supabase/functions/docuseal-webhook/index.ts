// docuseal-webhook/index.ts
// Receives DocuSeal webhook events.
// On `form.completed` (all parties signed):
//   - Sets activation_date = today  (DB trigger computes due_date = +1 month +1 day)
//   - Updates contract status to Active
//   - Records contract_signatures for both parties
//   - Notifies both parties

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json();

    // DocuSeal sends: { event_type: "form.completed", data: { submission: { id, ... } } }
    // and also individual submitter events like "form.viewed", "form.started"
    const eventType    = payload.event_type as string;
    const submissionId = payload.data?.submission?.id ?? payload.data?.id;

    if (!submissionId) return json({ ok: true }); // Not a submission event we care about

    if (eventType === "form.completed") {
      // All parties have signed — activate the contract
      const { data: contract } = await admin
        .from("contracts")
        .select("contract_id, contract_number, supplier_id, business_owner_id, status")
        .eq("docuseal_submission_id", String(submissionId))
        .single();

      if (!contract) return json({ error: "Contract not found for submission" }, 404);

      // Idempotency — ignore if already activated
      if (contract.status !== "Pending") return json({ ok: true, note: "Already processed" });

      const today = new Date().toISOString().slice(0, 10);

      // Update contract: activation_date triggers due_date computation via DB trigger
      await admin.from("contracts").update({
        activation_date: today,
        status: "Active",
      }).eq("contract_id", contract.contract_id);

      // Record signatures for both parties
      const now = new Date().toISOString();
      await admin.from("contract_signatures").insert([
        {
          contract_id:     contract.contract_id,
          signer_id:       contract.business_owner_id,
          signer_role:     "Business Owner",
          signature_order: 1,
          signed_at:       now,
        },
        {
          contract_id:     contract.contract_id,
          signer_id:       contract.supplier_id,
          signer_role:     "Supplier",
          signature_order: 2,
          signed_at:       now,
        },
      ]);

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
