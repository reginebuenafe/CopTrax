/**
 * ai-negotiate — auto-respond to Supplier proposals on behalf of the Business Owner.
 *
 * Rule:
 *   Supplier offer <= recommendedPrice  →  ACCEPT + generate & send contract
 *   Supplier offer >  recommendedPrice  →  COUNTEROFFER at exactly recommendedPrice
 *
 * `recommendedPrice` is computed by the centralized
 * `computeNegotiationPrice` helper (see ../_shared/negotiation_pricing.ts),
 * which derives the allowable price purely from the supplier's actual
 * overall rating — never a flat spot_price + 1, and never invented for a
 * supplier with no rating (they get exactly spot price).
 *
 * Called from:
 *   - BOChatLayout frontend (global realtime, works when BO is logged in)
 *   - pg_net DB trigger on proposal_forms INSERT (works when BO is offline)
 */

import { createClient } from "@supabase/supabase-js";
import { ContractTerms, computeContractHash } from "../_shared/contract_hash.ts";
import { renderContractPDF } from "../_shared/contract_pdf.ts";
import { computeNegotiationPrice } from "../_shared/negotiation_pricing.ts";
import { priceToWords } from "../_shared/price_to_words.ts";
import { verifyCaller } from "../_shared/verify_caller.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CONTRACT_BUCKET = "contracts";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long", day: "numeric", year: "numeric",
  });
}

async function generateAndSendContract(
  db: ReturnType<typeof createClient>,
  conv: { conversation_id: string; business_owner_id: string; supplier_id: string },
  proposal: { proposed_price_per_kg: number; proposed_volume_tons: number },
) {
  // 1. Generate contract number
  const { data: numData } = await db.rpc("generate_contract_number");

  // 2. Insert contract row
  const { data: contract, error: insertErr } = await db.from("contracts").insert({
    contract_number:         numData,
    supplier_id:             conv.supplier_id,
    business_owner_id:       conv.business_owner_id,
    negotiated_price_per_kg: proposal.proposed_price_per_kg,
    contracted_tons:         proposal.proposed_volume_tons,
    signing_date:            new Date().toISOString().split("T")[0],
    status:                  "Pending",
  }).select("contract_id, contract_number, negotiated_price_per_kg, contracted_tons, due_date").single();

  if (insertErr || !contract) {
    console.error("ai-negotiate: contract insert failed:", insertErr);
    return;
  }

  // 3. Link conversation → contract
  await db.from("conversations")
    .update({ contract_id: contract.contract_id })
    .eq("conversation_id", conv.conversation_id);

  // 4. Load supplier + BO profiles for PDF
  const [{ data: supplier }, { data: bo }] = await Promise.all([
    db.from("users").select("user_id, first_name, last_name, email, address").eq("user_id", conv.supplier_id).single(),
    db.from("users").select("user_id, first_name, last_name, email").eq("user_id", conv.business_owner_id).single(),
  ]);

  if (!supplier || !bo) {
    console.error("ai-negotiate: could not load supplier or BO profile");
    return;
  }

  // 5. Build contract terms + hash
  const nowIso = new Date().toISOString();
  const pricePerKgStr = Number(contract.negotiated_price_per_kg).toFixed(2);
  const tonsStr       = Number(contract.contracted_tons).toFixed(3);
  const supplierName  = `${supplier.first_name} ${supplier.last_name}`.trim();
  const boName        = `${bo.first_name} ${bo.last_name}`.trim();
  const supAddress    = (supplier.address as string | null) ?? "—";
  const deliveryLoc   = "Poblacion, Kumalarang, Zamboanga del Sur Warehouse";

  const terms: ContractTerms = {
    contract_number:         contract.contract_number as string,
    supplier_id:             supplier.user_id as string,
    supplier_name:           supplierName,
    supplier_address:        supAddress,
    business_owner_id:       bo.user_id as string,
    business_owner_name:     boName,
    contracted_tons:         tonsStr,
    negotiated_price_per_kg: pricePerKgStr,
    delivery_location:       deliveryLoc,
    special_notes:           "",
    created_at:              nowIso,
  };

  const contractHash = await computeContractHash(terms);
  const priceWords   = priceToWords(Number(pricePerKgStr));

  // 6. Render unsigned preview PDF
  const pdfBytes = await renderContractPDF({
    contract_number:        terms.contract_number,
    date_str:               fmtDate(nowIso),
    supplier_name:          supplierName,
    supplier_address:       supAddress,
    contracted_tons:        tonsStr,
    negotiated_price:       pricePerKgStr,
    negotiated_price_words: priceWords,
    due_date_text:          contract.due_date
      ? fmtDate(contract.due_date as string)
      : "one month and one day from activation",
    delivery_location:      deliveryLoc,
    special_notes:          "",
    business_owner_name:    boName,
    contract_hash:          contractHash,
  });

  // 7. Upload preview PDF
  const previewPath = `${conv.supplier_id}/${contract.contract_id}/preview.pdf`;
  const { error: uploadErr } = await db.storage
    .from(CONTRACT_BUCKET)
    .upload(previewPath, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadErr) {
    console.error("ai-negotiate: PDF upload failed:", uploadErr);
    return;
  }

  // 8. Update contract row with hash + document path
  await db.from("contracts").update({
    contract_hash:           contractHash,
    contract_terms_snapshot: terms as unknown as Record<string, unknown>,
    contract_document_url:   previewPath,
  }).eq("contract_id", contract.contract_id);

  // 9. Post contract card + message into chat (sent as BO, flagged as AI-generated
  //    so the Supplier UI can clearly indicate this came from the AI negotiator).
  await db.from("messages").insert({
    conversation_id: conv.conversation_id,
    sender_id:       conv.business_owner_id,
    message_type:    "Contract Form",
    is_ai_generated: true,
    message_text:    `CONTRACT_CARD:${JSON.stringify({
      contract_id:     contract.contract_id,
      contract_number: contract.contract_number,
      price_per_kg:    contract.negotiated_price_per_kg,
      contracted_tons: contract.contracted_tons,
      due_date:        contract.due_date,
      document_path:   previewPath,
    })}`,
  });

  await db.from("messages").insert({
    conversation_id: conv.conversation_id,
    sender_id:       conv.business_owner_id,
    message_type:    "Text",
    is_ai_generated: true,
    message_text:    "Your price proposal has been accepted. The contract has been generated — please review and sign when you're ready.",
  });

  // 10. Notify supplier about contract
  await db.from("notifications").insert({
    user_id:             conv.supplier_id,
    notification_type:   "Contract Generated",
    message:             `Contract ${contract.contract_number} is ready for your review and signature.`,
    related_entity_type: "contracts",
    related_entity_id:   contract.contract_id,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { proposal_id } = await req.json();
    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id is required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1. Fetch the proposal
    const { data: proposal, error: propErr } = await db
      .from("proposal_forms")
      .select("proposal_id, conversation_id, proposed_price_per_kg, proposed_volume_tons, supplier_id, submitted_by, proposal_status")
      .eq("proposal_id", proposal_id)
      .single();

    if (propErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Only process Pending proposals
    if (proposal.proposal_status !== "Pending") {
      return new Response(JSON.stringify({ skipped: "Proposal is no longer Pending" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 2. Check global AI auto-negotiate flag from app_config
    const { data: aiConfig } = await db
      .from("app_config")
      .select("value")
      .eq("key", "ai_auto_negotiate_global")
      .maybeSingle();

    if (aiConfig?.value !== "true") {
      return new Response(JSON.stringify({ skipped: "AI auto-negotiate is globally disabled" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch the conversation to get BO + supplier IDs
    const { data: conv, error: convErr } = await db
      .from("conversations")
      .select("conversation_id, business_owner_id, supplier_id")
      .eq("conversation_id", proposal.conversation_id)
      .single();

    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Only the conversation's own Business Owner (via the frontend, with a
    // real JWT) or our own DB trigger (via its private internal secret) may
    // trigger this proposal's
    // auto-negotiation — otherwise anyone holding a proposal_id UUID could
    // force accept/counteroffer/contract-generation for a negotiation that
    // isn't theirs.
    const callerCheck = await verifyCaller(req, [conv.business_owner_id], true);
    if (!callerCheck.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Only auto-respond to Supplier proposals (not BO's own counteroffers)
    if (proposal.submitted_by === conv.business_owner_id) {
      return new Response(JSON.stringify({ skipped: "Proposal was submitted by the Business Owner" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch current spot price
    const { data: spotRow } = await db
      .from("spot_price")
      .select("price_per_kg")
      .limit(1)
      .single();

    const spotPrice  = spotRow ? Number(spotRow.price_per_kg) : 0;
    const offerPrice = Number(proposal.proposed_price_per_kg);

    // Centralized pricing decision — driven purely by the supplier's actual
    // overall rating (spotPrice + ratingPremium). No volume/history/breach
    // adjustments are applied to the price.
    const pricing = await computeNegotiationPrice(
      db,
      proposal.supplier_id,
      spotPrice,
    );
    const threshold = pricing.recommendedPrice;

    console.log("ai-negotiate: pricing factors", pricing);

    if (offerPrice <= threshold) {
      // ── ACCEPT ──────────────────────────────────────────────────────────────
      await db.from("proposal_forms")
        .update({ proposal_status: "Accepted", reviewed_by: conv.business_owner_id })
        .eq("proposal_id", proposal_id);

      // Mark all other Pending proposals in this conversation as Modified
      await db.from("proposal_forms")
        .update({ proposal_status: "Modified" })
        .eq("conversation_id", conv.conversation_id)
        .eq("proposal_status", "Pending")
        .neq("proposal_id", proposal_id);

      // Notify supplier of acceptance
      await db.from("notifications").insert({
        user_id:             conv.supplier_id,
        notification_type:   "Proposal Accepted",
        message:             "NERC Copra Trading accepted your price proposal. A contract will be sent shortly.",
        related_entity_type: "conversations",
        related_entity_id:   conv.conversation_id,
      });

      // Generate and send the contract automatically
      await generateAndSendContract(db, conv, proposal);

      return new Response(JSON.stringify({ action: "accepted", price: offerPrice, pricing }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    } else {
      // ── COUNTEROFFER at the centrally-computed recommended price ─────────
      const counterPrice = threshold;

      // Mark the Supplier's proposal as Modified
      await db.from("proposal_forms")
        .update({ proposal_status: "Modified", reviewed_by: conv.business_owner_id })
        .eq("proposal_id", proposal_id);

      // Insert BO counteroffer (flagged as AI-generated so the Supplier UI can
      // clearly indicate this counteroffer came from the AI negotiator).
      await db.from("proposal_forms").insert({
        conversation_id:       conv.conversation_id,
        supplier_id:           conv.supplier_id,
        proposed_price_per_kg: counterPrice,
        proposed_volume_tons:  proposal.proposed_volume_tons,
        proposal_status:       "Pending",
        supersedes_proposal_id: proposal_id,
        submitted_by:          conv.business_owner_id,
        is_ai_generated:       true,
      });

      // Notify supplier
      await db.from("notifications").insert({
        user_id:             conv.supplier_id,
        notification_type:   "Counteroffer",
        message:             `NERC Copra Trading sent a counteroffer of ₱${counterPrice.toFixed(2)}/kg. Review it in the chat.`,
        related_entity_type: "conversations",
        related_entity_id:   conv.conversation_id,
      });

      return new Response(JSON.stringify({ action: "counteroffered", counter_price: counterPrice, pricing }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("ai-negotiate error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
