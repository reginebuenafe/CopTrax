// generate-contract/index.ts
// -----------------------------------------------------------------------------
// Cryptographic Signature Binding — Contract Generation
//
// Called by the Business Owner from the "Review & Generate Contract" modal.
// Steps:
//   1. Authenticate caller and confirm Business Owner role.
//   2. Load contract, supplier and BO profiles.
//   3. Build a canonical ContractTerms snapshot and compute its SHA-256 hash.
//      This hash cryptographically fingerprints the exact terms being offered.
//   4. Render an UNSIGNED preview PDF (pdf-lib) matching contract_template.docx.
//   5. Upload the preview PDF to the `contracts` storage bucket at
//      `<contract_id>/preview.pdf`.
//   6. Persist the hash + terms snapshot + document path on the contracts row.
//   7. Notify the Supplier.
//
// Idempotent: if a hash already exists on the row, we skip regeneration and
// return the existing document path.
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ContractTerms,
  canonicalJSON,
  computeContractHash,
} from "../_shared/contract_hash.ts";
import { renderContractPDF } from "../_shared/contract_pdf.ts";

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

    const { data: callerProfile } = await admin
      .from("users").select("role_id").eq("user_id", caller.id).single();
    if (!callerProfile) return json({ error: "Caller profile not found" }, 403);

    const { data: callerRole } = await admin
      .from("roles").select("role_name").eq("role_id", callerProfile.role_id).single();
    const roleName = callerRole?.role_name as string | undefined;

    // Only Business Owner or Supplier may trigger contract generation.
    // (Staff roles cannot.)
    if (roleName !== "Business Owner" && roleName !== "Supplier") {
      return json({ error: "Only Business Owner or Supplier can generate contracts" }, 403);
    }

    // ── 2. Parse request body ────────────────────────────────────────────────
    const { contract_id, delivery_location, special_notes } = await req.json();
    if (!contract_id) return json({ error: "contract_id is required" }, 400);

    // ── 3. Load contract + participants ──────────────────────────────────────
    const { data: contract, error: contractErr } = await admin
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, activation_date, status, contract_hash,
        contract_document_url, supplier_id, business_owner_id
      `)
      .eq("contract_id", contract_id)
      .single();

    if (contractErr || !contract) {
      return json({ error: `Contract not found (${contractErr?.message ?? "no data"})` }, 404);
    }

    // BO can only generate their own contracts; Supplier can only trigger for their own.
    if (roleName === "Business Owner" && contract.business_owner_id !== caller.id) {
      return json({ error: "You can only generate contracts that belong to you." }, 403);
    }
    if (roleName === "Supplier" && contract.supplier_id !== caller.id) {
      return json({ error: "You can only generate contracts you are a party to." }, 403);
    }

    if (contract.status !== "Pending") {
      return json({ error: `Contract is not Pending (current: ${contract.status})` }, 400);
    }

    const { data: supplier, error: supErr } = await admin
      .from("users")
      .select("user_id, first_name, last_name, email, address")
      .eq("user_id", contract.supplier_id)
      .single();
    if (supErr || !supplier) return json({ error: "Supplier profile not found" }, 404);

    const { data: bo, error: boErr } = await admin
      .from("users")
      .select("user_id, first_name, last_name, email")
      .eq("user_id", contract.business_owner_id)
      .single();
    if (boErr || !bo) return json({ error: "Business owner profile not found" }, 404);

    // ── 4. Build canonical terms + hash ──────────────────────────────────────
    const nowIso        = new Date().toISOString();
    const supplierName  = `${supplier.first_name} ${supplier.last_name}`.trim();
    const boName        = `${bo.first_name} ${bo.last_name}`.trim();
    const supAddress    = (supplier.address as string | null) ?? "—";
    const deliveryLoc   = (delivery_location as string | null)?.trim() || "Poblacion, Kumalarang, Zamboanga del Sur Warehouse";
    const notes         = (special_notes as string | null)?.trim() || "";

    // Preserve exact decimal precision by stringifying via toString().
    const pricePerKgStr  = Number(contract.negotiated_price_per_kg).toFixed(2);
    const tonsStr        = Number(contract.contracted_tons).toFixed(3);

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
      special_notes:           notes,
      created_at:              nowIso,
    };

    // Idempotency: if a hash is already set, reuse existing document.
    if (contract.contract_hash && contract.contract_document_url) {
      return json({
        success:              true,
        contract_document_path: contract.contract_document_url,
        contract_hash:        contract.contract_hash,
        already_exists:       true,
      });
    }

    const contractHash = await computeContractHash(terms);

    // ── 5. Render unsigned preview PDF ───────────────────────────────────────
    // Price words = price per kilogram in words (e.g. "Twenty Eight Pesos"), NOT total value.
    const priceWords  = numberToWords(Math.round(Number(pricePerKgStr)));

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
      special_notes:          notes,
      business_owner_name:    boName,
      contract_hash:          contractHash,
    });

    // ── 6. Upload preview PDF to storage ─────────────────────────────────────
    const previewPath = `${supplier.user_id}/${contract_id}/preview.pdf`;
    const { error: uploadErr } = await admin.storage
      .from(CONTRACT_BUCKET)
      .upload(previewPath, pdfBytes, {
        contentType: "application/pdf",
        upsert:       true,
      });
    if (uploadErr) {
      return json({ error: `PDF upload failed: ${uploadErr.message}` }, 500);
    }

    // ── 7. Persist hash + snapshot + document path on contract ───────────────
    const { error: updateErr } = await admin.from("contracts").update({
      contract_hash:           contractHash,
      contract_terms_snapshot: terms as unknown as Record<string, unknown>,
      contract_document_url:   previewPath,
      delivery_location:       delivery_location ?? null,
      special_notes:           special_notes ?? null,
    }).eq("contract_id", contract_id);

    if (updateErr) return json({ error: `DB update failed: ${updateErr.message}` }, 500);

    // ── 8. Notify supplier ───────────────────────────────────────────────────
    await admin.from("notifications").insert({
      user_id:             supplier.user_id as string,
      notification_type:   "Contract Generated",
      message:             `Contract ${contract.contract_number} is ready for your review and signature.`,
      related_entity_type: "contracts",
      related_entity_id:   contract_id,
    });

    return json({
      success:                true,
      contract_document_path: previewPath,
      contract_hash:          contractHash,
      canonical_json:         canonicalJSON(terms as unknown as Record<string, unknown>),
    });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ── Simple number-to-words helper for Philippine peso amounts ────────────────
function numberToWords(n: number): string {
  if (n === 0) return "Zero Pesos";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function chunk(num: number): string {
    if (num === 0) return "";
    if (num < 20)  return ones[num] + " ";
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "") + " ";
    return ones[Math.floor(num / 100)] + " Hundred " + chunk(num % 100);
  }

  let result = "";
  if (n >= 1_000_000) { result += chunk(Math.floor(n / 1_000_000)) + "Million "; n %= 1_000_000; }
  if (n >= 1_000)     { result += chunk(Math.floor(n / 1_000))     + "Thousand "; n %= 1_000; }
  if (n > 0)           result += chunk(n);

  return result.trim() + " Pesos";
}
