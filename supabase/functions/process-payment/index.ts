// process-payment/index.ts
// Called by the BO when releasing a payment batch.
// Sends a disbursement request to Xendit, then marks the payment Released
// and generates an e-receipt row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XENDIT_SECRET_KEY = Deno.env.get("XENDIT_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "payment_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch payment + supplier bank info
    const { data: payment, error: pErr } = await supabase
      .from("payments")
      .select(`
        payment_id, total_amount, payment_week, payment_method, payment_status,
        supplier:supplier_id(
          user_id, first_name, last_name, email, phone
        )
      `)
      .eq("payment_id", payment_id)
      .single();

    if (pErr || !payment) return json({ error: "Payment not found" }, 404);
    if (payment.payment_status === "Released") return json({ error: "Payment already released" }, 400);

    let referenceNumber: string;
    let xenditResponse: Record<string, unknown> | null = null;

    if (payment.payment_method === "Bank Transfer" && XENDIT_SECRET_KEY) {
      // Xendit disbursement request
      const externalId = `coptrax-${payment_id}-${Date.now()}`;
      const xenditPayload = {
        external_id: externalId,
        amount: Math.round(Number(payment.total_amount)),
        bank_code: "BDO",   // TODO: store supplier's bank_code in their profile
        account_number: "0000000000", // TODO: store supplier's account_number in profile
        account_holder_name: `${payment.supplier.first_name} ${payment.supplier.last_name}`,
        description: `CopTrax payment for week of ${payment.payment_week}`,
      };

      const xenditRes = await fetch("https://api.xendit.co/disbursements", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(XENDIT_SECRET_KEY + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(xenditPayload),
      });

      xenditResponse = await xenditRes.json() as Record<string, unknown>;

      if (!xenditRes.ok) {
        return json({ error: "Xendit disbursement failed", details: xenditResponse }, 502);
      }

      referenceNumber = (xenditResponse.id as string) ?? externalId;
    } else {
      // Cash payment or no Xendit key configured — mark directly
      referenceNumber = `CASH-${Date.now()}`;
    }

    // Generate e-receipt number: RCP-YYYYMMDD-XXXX
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const { count } = await supabase
      .from("e_receipts")
      .select("*", { count: "exact", head: true });
    const seq = String((count ?? 0) + 1).padStart(4, "0");
    const receiptNumber = `RCP-${today}-${seq}`;

    // Update payment status → Released
    await supabase.from("payments").update({
      payment_status: "Released",
      reference_number: referenceNumber,
      payment_date: new Date().toISOString().slice(0, 10),
    }).eq("payment_id", payment_id);

    // Create e-receipt row
    await supabase.from("e_receipts").insert({
      payment_id,
      receipt_number: receiptNumber,
    });

    // Notify supplier
    await supabase.from("notifications").insert({
      user_id: payment.supplier.user_id,
      message: `Payment of ₱${Number(payment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} has been released. Reference: ${referenceNumber}`,
      notification_type: "Payment Released",
      related_entity_type: "payments",
      related_entity_id: payment_id,
    });

    return json({ success: true, receipt_number: receiptNumber, reference_number: referenceNumber });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
