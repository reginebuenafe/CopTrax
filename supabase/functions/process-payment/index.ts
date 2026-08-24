// process-payment/index.ts
// Called by the BO when releasing a payment batch.
// Sets the payment to Processing, submits a Xendit Payouts v2 request (test mode),
// and stores the xendit_payout_id. The xendit-payout-webhook function finalises
// the payment (Released / Failed) once Xendit sends the callback.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XENDIT_SECRET_KEY        = Deno.env.get("XENDIT_SECRET_KEY") ?? "";
const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map the bank names stored in bank_accounts to Xendit Payouts v2 channel codes.
// https://developers.xendit.co/api-reference/#create-payout
const BANK_TO_CHANNEL: Record<string, string> = {
  "BDO Unibank": "PH_BDO",
  "BDO Network Bank": "PH_BDO",
  "Bank of the Philippine Islands (BPI)": "PH_BPI",
  "BPI Direct BanKo": "PH_BPI",
  "Metropolitan Bank and Trust Company (Metrobank)": "PH_METROBANK",
  "Land Bank of the Philippines": "PH_LANDBANK",
  "Philippine National Bank (PNB)": "PH_PNB",
  "RCBC": "PH_RCBC",
  "UnionBank of the Philippines": "PH_UNIONBANK",
  "China Bank": "PH_CHINABANK",
  "China Bank Savings": "PH_CHINABANK",
  "Security Bank": "PH_SECURITYBANK",
  "EastWest Bank": "PH_EASTWEST",
  "Philippine Savings Bank (PSBank)": "PH_PSBANK",
  "Maybank Philippines": "PH_MAYBANK",
  "Development Bank of the Philippines (DBP)": "PH_DBP",
  "Asia United Bank": "PH_AUB",
  "Philippine Bank of Communications (PBCOM)": "PH_PBCOM",
  "SeaBank Philippines": "PH_SEABANK",
  "GoTyme Bank": "PH_GOTYME",
  "Tonik Digital Bank": "PH_TONIK",
  "GCash": "PH_GCASH",
  "Maya Wallet": "PH_PAYMAYA",
  "Maya Bank": "PH_PAYMAYA",
};

function resolveChannelCode(bankName: string): string | null {
  // Direct match
  if (BANK_TO_CHANNEL[bankName]) return BANK_TO_CHANNEL[bankName];
  // Case-insensitive partial match fallback
  const lower = bankName.toLowerCase();
  for (const [key, code] of Object.entries(BANK_TO_CHANNEL)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return code;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "payment_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch payment + supplier info
    const { data: payment, error: pErr } = await supabase
      .from("payments")
      .select(`
        payment_id, total_amount, payment_week, payment_method, payment_status,
        supplier:supplier_id(user_id, first_name, last_name, email)
      `)
      .eq("payment_id", payment_id)
      .single();

    if (pErr || !payment) return json({ error: "Payment not found" }, 404);

    // Prevent duplicate payouts
    if (payment.payment_status === "Processing") {
      return json({ error: "Payment is already being processed." }, 400);
    }
    if (payment.payment_status === "Released") {
      return json({ error: "Payment has already been released." }, 400);
    }

    // Mark as Processing immediately so a second click cannot re-submit
    const { error: updateErr } = await supabase
      .from("payments")
      .update({ payment_status: "Processing" })
      .eq("payment_id", payment_id);

    if (updateErr) return json({ error: "Failed to update payment status." }, 500);

    // Fetch supplier bank account
    const { data: bankAccount } = await supabase
      .from("bank_accounts")
      .select("bank_name, account_name, account_number")
      .eq("user_id", payment.supplier.user_id)
      .single();

    if (!bankAccount) {
      // Roll back to Pending so the BO can fix the issue
      await supabase.from("payments").update({ payment_status: "Pending" }).eq("payment_id", payment_id);
      return json({ error: "Supplier has no bank account on file. Ask the supplier to add bank details first." }, 422);
    }

    if (!XENDIT_SECRET_KEY) {
      // No Xendit key — roll back and surface the config error
      await supabase.from("payments").update({ payment_status: "Pending" }).eq("payment_id", payment_id);
      return json({ error: "Xendit secret key is not configured on the server." }, 500);
    }

    const channelCode = resolveChannelCode(bankAccount.bank_name);
    if (!channelCode) {
      await supabase.from("payments").update({ payment_status: "Pending" }).eq("payment_id", payment_id);
      return json({ error: `Bank "${bankAccount.bank_name}" is not supported for automatic payout. Please process manually.` }, 422);
    }

    // Submit Xendit Payouts v2 request (test mode uses the same endpoint with test keys)
    const referenceId = `coptrax-${payment_id}-${Date.now()}`;
    const xenditPayload = {
      reference_id: referenceId,
      currency: "PHP",
      channel_code: channelCode,
      channel_properties: {
        account_holder_name: bankAccount.account_name,
        account_number: bankAccount.account_number,
      },
      amount: Number(payment.total_amount),
      description: `CopTrax payout – week of ${payment.payment_week}`,
    };

    const xenditRes = await fetch("https://api.xendit.co/v2/payouts", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(XENDIT_SECRET_KEY + ":")}`,
        "Content-Type": "application/json",
        "idempotency-key": referenceId,
      },
      body: JSON.stringify(xenditPayload),
    });

    const xenditData = await xenditRes.json() as Record<string, unknown>;

    if (!xenditRes.ok) {
      // Xendit rejected the request — mark Failed so BO can investigate
      await supabase.from("payments").update({ payment_status: "Failed" }).eq("payment_id", payment_id);
      const xenditMsg = (xenditData.message as string) ?? "Xendit payout request failed.";
      return json({ error: xenditMsg, details: xenditData }, 502);
    }

    // Store Xendit's payout ID — the webhook will finalise to Released / Failed
    // The Payouts v2 API returns `payout_id` (not `id`)
    const xenditPayoutId = (xenditData.payout_id as string) ?? referenceId;
    console.log(`[process-payment] Xendit payout created: payout_id=${xenditPayoutId} reference_id=${referenceId} status=${xenditData.status}`);
    await supabase
      .from("payments")
      .update({ xendit_payout_id: xenditPayoutId })
      .eq("payment_id", payment_id);

    return json({ processing: true, xendit_payout_id: xenditPayoutId });
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
