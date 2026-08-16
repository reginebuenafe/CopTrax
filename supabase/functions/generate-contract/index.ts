// generate-contract/index.ts
// New signing flow (REQ-4.3): Business Owner generates a contract →
// CopTrax creates a DocuSeal submission with all text fields pre-filled.
// Both signatures are applied LATER by the sign-contract function
// (triggered when the Supplier authorizes via checkbox in-app).
//
// This function is idempotent per contract — if a submission already exists,
// it just returns the existing IDs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DOCUSEAL_API_KEY          = Deno.env.get("DOCUSEAL_API_KEY") ?? "";

// DocuSeal template: https://docuseal.com/d/jtLfHaeksfSED5
const DOCUSEAL_TEMPLATE_ID = 5441999;
const DOCUSEAL_API_BASE    = "https://api.docuseal.com";

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
    if (callerRole?.role_name !== "Business Owner") {
      return json({ error: "Only Business Owner can generate contracts" }, 403);
    }

    // ── 2. Parse request body ────────────────────────────────────────────────
    const { contract_id, delivery_location, special_notes, refresh_existing } = await req.json();
    if (!contract_id) return json({ error: "contract_id is required" }, 400);

    // ── 3. Load contract + supplier ──────────────────────────────────────────
    const { data: contract, error: contractErr } = await admin
      .from("contracts")
      .select(`
        contract_id, contract_number, negotiated_price_per_kg, contracted_tons,
        signing_date, due_date, activation_date, created_at, status, docuseal_submission_id,
        docuseal_bo_slug, docuseal_supplier_slug, contract_document_url,
        supplier_id, business_owner_id, supplier_authorized_at
      `)
      .eq("contract_id", contract_id)
      .single();

    if (contractErr || !contract) {
      return json({ error: `Contract not found (${contractErr?.message ?? "no data"})` }, 404);
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

    // ── 4. Compute field values ──────────────────────────────────────────────
    const pricePerKg = Number(contract.negotiated_price_per_kg);
    // The PRICE clause is expressed per kilogram, so its written amount must
    // describe the negotiated per-kg price rather than the full contract value.
    const priceWords = moneyToWords(pricePerKg);

    // The legal deadline is finalized by the activation trigger. For the
    // pre-signing document, use the stored projected deadline; older Pending
    // rows without one receive a concise projected date instead of a long
    // sentence that DocuSeal has to shrink inside the SHIPMENT field.
    const projectedDueDate = contract.due_date ?? getProjectedDueDate();
    const dueDateText = formatContractDate(projectedDueDate);

    // ── 5. Create DocuSeal submission WITHOUT sending email or signatures ────
    // Business Owner is the sole DocuSeal submitter on the template. The
    // Supplier signature is applied first by sign-contract; the BO later opens
    // this submitter session inside CopTrax and completes the submission.
    const values: Record<string, string> = {
      contract_number:               contract.contract_number,
      contract_date:                 formatContractDate(contract.signing_date ?? contract.created_at),
      supplier_name:                 `${supplier.first_name} ${supplier.last_name}`,
      supplier_signatory_name:       `${supplier.first_name} ${supplier.last_name}`.toUpperCase(),
      supplier_address:              (supplier.address as string) ?? "—",
      contract_quantity:             `${contract.contracted_tons}`,
      negotiated_price:              String(pricePerKg),
      negotiated_price_in_romanized: priceWords,
      due_date:                      dueDateText,
    };

    // Arial is not available in DocuSeal's PDF font set. Helvetica is its
    // closest standard equivalent. The signatory label uses a separate field
    // so it can be bold and uppercase without changing the SELLER detail row.
    const fields = Object.entries(values).map(([name, defaultValue]) => ({
      name,
      default_value: defaultValue,
      readonly: true,
      preferences: {
        font: "Helvetica",
        font_size: 11,
        ...(name === "supplier_signatory_name" ? { font_type: "bold" } : {}),
        color: "black",
        align: name === "supplier_signatory_name" ? "center" : "left",
        valign: "center",
      },
    }));

    // Existing Pending submissions can be refreshed in place. This updates
    // their field typography and values without creating a duplicate signing
    // request. Once the Supplier has signed, the document is immutable here.
    if (contract.docuseal_submission_id) {
      if (!refresh_existing) {
        return json({
          success:                true,
          docuseal_submission_id: contract.docuseal_submission_id,
          bo_sign_url:            contract.docuseal_supplier_slug ? `https://docuseal.com/s/${contract.docuseal_supplier_slug}` : null,
          preview_url:            contract.contract_document_url ?? null,
          already_exists:         true,
        });
      }
      if (contract.supplier_authorized_at) {
        return json({ error: "A contract cannot be refreshed after the Supplier has signed." }, 409);
      }
      if (!contract.docuseal_bo_slug) {
        return json({ error: "DocuSeal submitter ID is missing for this contract." }, 500);
      }

      const refreshRes = await fetch(`${DOCUSEAL_API_BASE}/submitters/${contract.docuseal_bo_slug}`, {
        method: "PUT",
        headers: { "X-Auth-Token": DOCUSEAL_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ values, fields }),
      });
      if (!refreshRes.ok) {
        return json({ error: `DocuSeal refresh failed: ${await refreshRes.text()}` }, 502);
      }

      const documentsRes = await fetch(
        `${DOCUSEAL_API_BASE}/submissions/${contract.docuseal_submission_id}/documents`,
        { headers: { "X-Auth-Token": DOCUSEAL_API_KEY, "Cache-Control": "no-cache" } },
      );
      if (!documentsRes.ok) {
        return json({ error: `DocuSeal preview refresh failed: ${await documentsRes.text()}` }, 502);
      }
      const documentsData = await documentsRes.json();
      const refreshedPreviewUrl = (documentsData?.documents?.[0]?.url as string | undefined)
        ?? contract.contract_document_url;

      const { error: refreshUpdateError } = await admin.from("contracts").update({
        contract_document_url: refreshedPreviewUrl,
      }).eq("contract_id", contract_id);
      if (refreshUpdateError) {
        return json({ error: `DB refresh update failed: ${refreshUpdateError.message}` }, 500);
      }

      return json({
        success: true,
        docuseal_submission_id: contract.docuseal_submission_id,
        preview_url: refreshedPreviewUrl,
        refreshed: true,
      });
    }

    const submissionBody = {
      template_id: DOCUSEAL_TEMPLATE_ID,
      send_email:  false,
      submitters: [
        {
          role:       "First Party",
          email:      bo.email as string,
          name:       `${bo.first_name} ${bo.last_name}`,
          send_email: false,
          values,
          fields,
        },
      ],
    };

    const submissionRes = await fetch(`${DOCUSEAL_API_BASE}/submissions`, {
      method:  "POST",
      headers: { "X-Auth-Token": DOCUSEAL_API_KEY, "Content-Type": "application/json" },
      body:    JSON.stringify(submissionBody),
    });

    if (!submissionRes.ok) {
      const submissionErr = await submissionRes.text();
      return json({ error: `DocuSeal submission creation failed: ${submissionErr}` }, 502);
    }

    const submissionData = await submissionRes.json();
    const submitters: Record<string, unknown>[] = Array.isArray(submissionData)
      ? submissionData
      : (submissionData.submitters as Record<string, unknown>[] | undefined) ?? [];

    const boSubmitter          = submitters[0] ?? {};
    const docusealSubmissionId = boSubmitter.submission_id as number | string | undefined;
    const docusealSubmitterId  = boSubmitter.id            as number | string | undefined;
    const docusealBoSlug       = boSubmitter.slug          as string | undefined;

    // Obtain a read-only partially filled PDF for chat and Supplier review.
    // Never place the BO's bearer signing URL in a chat message payload.
    let previewDocumentUrl = ((boSubmitter.documents as Record<string, unknown>[] | undefined)?.[0]?.url as string | undefined) ?? null;
    if (!previewDocumentUrl && docusealSubmissionId) {
      const documentsRes = await fetch(
        `${DOCUSEAL_API_BASE}/submissions/${docusealSubmissionId}/documents`,
        { headers: { "X-Auth-Token": DOCUSEAL_API_KEY } },
      );
      if (documentsRes.ok) {
        const documentsData = await documentsRes.json();
        previewDocumentUrl = (documentsData?.documents?.[0]?.url as string | undefined) ?? null;
      }
    }

    // ── 6. Persist DocuSeal IDs on the contract row ──────────────────────────
    const { error: updateErr } = await admin.from("contracts").update({
      docuseal_submission_id: docusealSubmissionId ? String(docusealSubmissionId) : null,
      docuseal_bo_slug:       docusealSubmitterId  ? String(docusealSubmitterId)  : null, // reuse column to store submitter ID for later PUT
      docuseal_supplier_slug: docusealBoSlug ?? null,                                     // BO signing slug
      contract_document_url: previewDocumentUrl,
      delivery_location:      delivery_location ?? null,
      special_notes:          special_notes ?? null,
    }).eq("contract_id", contract_id);

    if (updateErr) return json({ error: `DB update failed: ${updateErr.message}` }, 500);

    // ── 7. Notify supplier — action required ─────────────────────────────────
    await admin.from("notifications").insert({
      user_id:             supplier.user_id as string,
      notification_type:   "Contract Generated",
      message:             `Contract ${contract.contract_number} is ready for your review and signature.`,
      related_entity_type: "contracts",
      related_entity_id:   contract_id,
    });

    return json({
      success:                true,
      docuseal_submission_id: docusealSubmissionId,
      preview_url:            previewDocumentUrl,
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

function moneyToWords(amount: number): string {
  const roundedCentavos = Math.round(amount * 100);
  const pesos = Math.floor(roundedCentavos / 100);
  const centavos = roundedCentavos % 100;
  const pesoWords = numberToWords(pesos);
  if (!centavos) return pesoWords;

  const centavoWords = numberToWords(centavos).replace(/ Pesos$/, "");
  return `${pesoWords} and ${centavoWords} Centavos`;
}

function getProjectedDueDate(): string {
  const manilaParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(manilaParts.find(item => item.type === type)?.value);
  const currentYear = part("year");
  const currentMonthIndex = part("month") - 1;
  const targetMonthIndex = (currentMonthIndex + 1) % 12;
  const targetYear = currentYear + (currentMonthIndex === 11 ? 1 : 0);
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const projected = new Date(Date.UTC(
    targetYear,
    targetMonthIndex,
    Math.min(part("day"), lastDayOfTargetMonth),
  ));
  projected.setUTCDate(projected.getUTCDate() + 1);
  return projected.toISOString().slice(0, 10);
}

function formatContractDate(value: string): string {
  const dateOnly = String(value).slice(0, 10);
  const [year, month, day] = dateOnly.split("-");
  return year && month && day ? `${month}/${day}/${year}` : String(value);
}
