// auto-release-payments/index.ts
// Runs automatically every Friday at 5:00 PM PHT (09:00 UTC).
// Finds all Pending payment batches whose payment_week is on or before today
// and submits each one to Xendit — reusing the exact same flow as process-payment.
//
// Deploy with schedule:
//   supabase functions deploy auto-release-payments --no-verify-jwt --schedule "0 9 * * 5"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XENDIT_SECRET_KEY         = Deno.env.get("XENDIT_SECRET_KEY") ?? "";
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  if (BANK_TO_CHANNEL[bankName]) return BANK_TO_CHANNEL[bankName];
  const lower = bankName.toLowerCase();
  for (const [key, code] of Object.entries(BANK_TO_CHANNEL)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return code;
  }
  return null;
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find all Pending batches whose disbursement week is today or earlier
    const today = new Date().toISOString().split("T")[0];
    const { data: payments, error: fetchErr } = await supabase
      .from("payments")
      .select(`
        payment_id, total_amount, payment_week,
        supplier:supplier_id(user_id, first_name, last_name)
      `)
      .eq("payment_status", "Pending")
      .lte("payment_week", today);

    if (fetchErr) {
      console.error("[auto-release] Failed to fetch pending payments:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    if (!payments || payments.length === 0) {
      console.log("[auto-release] No pending payments due for release today.");
      return new Response(JSON.stringify({ released: 0 }), { status: 200 });
    }

    console.log(`[auto-release] Found ${payments.length} payment(s) to release.`);

    const results: { payment_id: string; status: string; error?: string }[] = [];

    for (const payment of payments) {
      const pid = payment.payment_id;

      // Mark Processing to prevent duplicate submissions
      const { error: markErr } = await supabase
        .from("payments")
        .update({ payment_status: "Processing" })
        .eq("payment_id", pid)
        .eq("payment_status", "Pending"); // guard: only update if still Pending

      if (markErr) {
        results.push({ payment_id: pid, status: "skipped", error: markErr.message });
        continue;
      }

      // Fetch supplier bank account
      const { data: bankAccount } = await supabase
        .from("bank_accounts")
        .select("bank_name, account_name, account_number")
        .eq("user_id", payment.supplier.user_id)
        .single();

      if (!bankAccount) {
        await supabase.from("payments").update({ payment_status: "Pending" }).eq("payment_id", pid);
        results.push({ payment_id: pid, status: "failed", error: "No bank account on file" });
        continue;
      }

      if (!XENDIT_SECRET_KEY) {
        await supabase.from("payments").update({ payment_status: "Pending" }).eq("payment_id", pid);
        results.push({ payment_id: pid, status: "failed", error: "XENDIT_SECRET_KEY not configured" });
        continue;
      }

      const channelCode = resolveChannelCode(bankAccount.bank_name);
      if (!channelCode) {
        await supabase.from("payments").update({ payment_status: "Pending" }).eq("payment_id", pid);
        results.push({ payment_id: pid, status: "failed", error: `Unsupported bank: ${bankAccount.bank_name}` });
        continue;
      }

      const referenceId = `coptrax-auto-${pid}-${Date.now()}`;
      const xenditRes = await fetch("https://api.xendit.co/v2/payouts", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(XENDIT_SECRET_KEY + ":")}`,
          "Content-Type": "application/json",
          "idempotency-key": referenceId,
        },
        body: JSON.stringify({
          reference_id:      referenceId,
          currency:          "PHP",
          channel_code:      channelCode,
          channel_properties: {
            account_holder_name: bankAccount.account_name,
            account_number:      bankAccount.account_number,
          },
          amount:      Number(payment.total_amount),
          description: `CopTrax auto-payout – week of ${payment.payment_week}`,
        }),
      });

      const xenditData = await xenditRes.json() as Record<string, unknown>;

      if (!xenditRes.ok) {
        await supabase.from("payments").update({ payment_status: "Failed" }).eq("payment_id", pid);
        results.push({ payment_id: pid, status: "failed", error: String(xenditData.message ?? "Xendit error") });
        continue;
      }

      const xenditPayoutId = (xenditData.payout_id as string) ?? referenceId;
      await supabase.from("payments").update({ xendit_payout_id: xenditPayoutId }).eq("payment_id", pid);
      results.push({ payment_id: pid, status: "processing" });
      console.log(`[auto-release] Submitted payout for payment_id=${pid} payout_id=${xenditPayoutId}`);
    }

    return new Response(JSON.stringify({ released: results.filter(r => r.status === "processing").length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-release] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
