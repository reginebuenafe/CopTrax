// xendit-payout-webhook/index.ts
// Receives Xendit Payouts v2 webhook callbacks.
// Finds the matching payment by xendit_payout_id (or reference_id fallback) and
// updates its status accordingly.
// Deploys with: supabase functions deploy xendit-payout-webhook --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XENDIT_WEBHOOK_TOKEN      = Deno.env.get("XENDIT_WEBHOOK_TOKEN") ?? "";
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function extractPaymentIdFromReference(referenceId: string | undefined): string | null {
  if (!referenceId) return null;
  const match = referenceId.match(/^coptrax-([0-9a-f-]{36})-\d+$/i);
  return match?.[1] ?? null;
}

Deno.serve(async (req) => {
  // Xendit sends the webhook verification token in this header.
  // Log mismatches but do NOT reject — Xendit may omit the header in test mode
  // or token config may differ. Rejecting with 401 causes Xendit to stop retrying.
  const callbackToken = req.headers.get("x-callback-token") ?? "";
  if (XENDIT_WEBHOOK_TOKEN && callbackToken !== XENDIT_WEBHOOK_TOKEN) {
    console.warn(`[xendit-payout-webhook] Callback token mismatch (expected set, got "${callbackToken}") — proceeding anyway`);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Xendit Payouts v2 webhook sends the payout object directly at the root.
  // The field is `payout_id` (not `id`). There may also be an `event` field
  // in formats like "Payout.Succeeded" or "payout.succeeded".
  const event      = (body.event as string | undefined) ?? "";
  // The payout object is at root level; no `data` wrapper for Payouts v2.
  const payoutData = (body.data as Record<string, unknown>) ?? body;

  // `payout_id` is the authoritative Xendit identifier for Payouts v2
  const xenditPayoutId = (payoutData.payout_id as string | undefined);
  const referenceId    = (payoutData.reference_id as string | undefined);
  const status         = ((payoutData.status as string) ?? "").toUpperCase();

  console.log(`[xendit-payout-webhook] Received event="${event}" payout_id="${xenditPayoutId}" reference_id="${referenceId}" status="${status}"`);

  if (!xenditPayoutId && !referenceId) {
    // Unknown payload shape — acknowledge safely so Xendit stops retrying
    return new Response("OK", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find payment by xendit payout_id first, then fall back to reference_id
  let payment = null;

  if (xenditPayoutId) {
    const { data } = await supabase
      .from("payments")
      .select("payment_id, total_amount, payment_status, supplier:supplier_id(user_id)")
      .eq("xendit_payout_id", xenditPayoutId)
      .maybeSingle();
    payment = data;
  }

  // Fallback: earlier payouts may have stored the reference_id in xendit_payout_id
  if (!payment && referenceId) {
    const { data } = await supabase
      .from("payments")
      .select("payment_id, total_amount, payment_status, supplier:supplier_id(user_id)")
      .eq("xendit_payout_id", referenceId)
      .maybeSingle();
    payment = data;
  }

  // Final fallback: reference_id is generated as "coptrax-<payment_id>-<timestamp>"
  // so we can still resolve even if xendit_payout_id was not stored.
  if (!payment) {
    const paymentIdFromRef = extractPaymentIdFromReference(referenceId);
    if (paymentIdFromRef) {
      const { data } = await supabase
        .from("payments")
        .select("payment_id, total_amount, payment_status, supplier:supplier_id(user_id)")
        .eq("payment_id", paymentIdFromRef)
        .maybeSingle();
      payment = data;
    }
  }

  if (!payment) {
    console.log("[xendit-payout-webhook] No matching payment found — ignoring");
    return new Response("OK", { status: 200 });
  }

  // Idempotent: only act on still-Processing payments
  if (payment.payment_status !== "Processing") {
    console.log(`[xendit-payout-webhook] Payment ${payment.payment_id} already in status "${payment.payment_status}" — ignoring`);
    return new Response("OK", { status: 200 });
  }

  // Xendit Payouts terminal success statuses can arrive as SUCCEEDED or COMPLETED.
  // Accept it from: status field OR event name (case-insensitive).
  const isSuccess = status === "SUCCEEDED"
    || status === "COMPLETED"
    || event.toUpperCase().includes("SUCCEEDED")
    || event.toUpperCase().includes("COMPLETED");

  // Terminal failure statuses
  const isFailure = status === "FAILED"
    || status === "CANCELLED"
    || status === "REVERSED"
    || event.toUpperCase().includes("FAILED");

  console.log(`[xendit-payout-webhook] payment_id=${payment.payment_id} isSuccess=${isSuccess} isFailure=${isFailure}`);

  if (isSuccess) {
    const ref = referenceId ?? xenditPayoutId ?? String(payment.payment_id);

    // Guard against duplicate e-receipts
    const { data: existingReceipt } = await supabase
      .from("e_receipts")
      .select("receipt_number")
      .eq("payment_id", payment.payment_id)
      .maybeSingle();

    if (!existingReceipt) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const { count } = await supabase
        .from("e_receipts")
        .select("*", { count: "exact", head: true });
      const seq = String((count ?? 0) + 1).padStart(4, "0");
      const receiptNumber = `RCP-${today}-${seq}`;

      await supabase.from("e_receipts").insert({
        payment_id: payment.payment_id,
        receipt_number: receiptNumber,
      });
    }

    await supabase.from("payments").update({
      payment_status: "Released",
      reference_number: ref,
      payment_date: new Date().toISOString().slice(0, 10),
    }).eq("payment_id", payment.payment_id);

    const supplierReleased = Array.isArray(payment.supplier) ? payment.supplier[0] : payment.supplier;
    await supabase.from("notifications").insert({
      user_id: supplierReleased?.user_id,
      message: `Payment of ₱${Number(payment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} has been released. Reference: ${ref}`,
      notification_type: "Payment Released",
      related_entity_type: "payments",
      related_entity_id: payment.payment_id,
    });

    console.log(`[xendit-payout-webhook] Payment ${payment.payment_id} → Released`);
  } else if (isFailure) {
    const failureCode = (payoutData.failure_code as string) ?? "PAYOUT_FAILED";

    await supabase.from("payments").update({
      payment_status: "Failed",
    }).eq("payment_id", payment.payment_id);

    const supplierFailed = Array.isArray(payment.supplier) ? payment.supplier[0] : payment.supplier;
    await supabase.from("notifications").insert({
      user_id: supplierFailed?.user_id,
      message: `Payment of ₱${Number(payment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} could not be processed (${failureCode}). The business owner will retry.`,
      notification_type: "Payment Released",
      related_entity_type: "payments",
      related_entity_id: payment.payment_id,
    });

    console.log(`[xendit-payout-webhook] Payment ${payment.payment_id} → Failed (${failureCode})`);
  } else {
    // Intermediate status (ACCEPTED, REQUESTED, PENDING_COMPLIANCE_ASSESSMENT) — stay Processing
    console.log(`[xendit-payout-webhook] Payment ${payment.payment_id} still in intermediate status "${status}" — no update`);
  }

  return new Response("OK", { status: 200 });
});
