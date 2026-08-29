// notify-supplier/index.ts
// Sends an email notification to a Supplier.
// Called by the Business Owner frontend after approving or rejecting a Supplier account.
//
// Expected body:
//   { type: "approved" | "rejected", supplier_id: string }
//
// Auth: requires a valid Business Owner JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/send_email.ts";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Missing authorization token" }, 401);

    const caller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await caller.auth.getUser(token);
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    // Verify caller is Business Owner
    const { data: callerProfile } = await caller
      .from("users")
      .select("roles(role_name)")
      .eq("user_id", user.id)
      .single();

    const roleName = (callerProfile as { roles: { role_name: string } } | null)?.roles?.role_name;
    if (roleName !== "Business Owner") return json({ error: "Forbidden" }, 403);

    const { type, supplier_id } = await req.json();

    if (!type || !supplier_id) {
      return json({ error: "type and supplier_id are required" }, 400);
    }
    if (type !== "approved" && type !== "rejected") {
      return json({ error: "type must be 'approved' or 'rejected'" }, 400);
    }

    // Fetch supplier profile
    const { data: supplier, error: supplierErr } = await caller
      .from("users")
      .select("first_name, last_name, email")
      .eq("user_id", supplier_id)
      .single();

    if (supplierErr || !supplier) {
      return json({ error: "Supplier not found" }, 404);
    }

    const firstName = supplier.first_name ?? "Supplier";
    const appUrl    = "https://coptrax.onrender.com/login";

    if (type === "approved") {
      await sendEmail({
        to:      supplier.email,
        subject: "Your CopTrax account has been approved ✓",
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3E2723;">
            <div style="background: #2E7D32; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 20px;">NERC Copra Trading</h1>
              <p style="color: #C8E6C9; margin: 4px 0 0; font-size: 13px;">CopTrax Supplier Portal</p>
            </div>
            <div style="background: #FFFEFB; padding: 32px; border: 1px solid #DCCDB4; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; font-weight: 600; margin-top: 0;">Hi ${firstName},</p>
              <p style="line-height: 1.6;">
                Great news! Your supplier account with <strong>NERC Copra Trading</strong> has been
                <strong style="color: #2E7D32;">approved</strong>.
              </p>
              <p style="line-height: 1.6;">
                You can now log in to the CopTrax portal to view contracts, submit deliveries,
                and track your payments.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}"
                   style="background: #2E7D32; color: #fff; text-decoration: none;
                          padding: 14px 32px; border-radius: 8px; font-weight: 700;
                          font-size: 15px; display: inline-block;">
                  Log in to CopTrax
                </a>
              </div>
              <p style="font-size: 13px; color: #8D6E63; line-height: 1.6;">
                If you have any questions, please contact NERC Copra Trading directly.
              </p>
              <hr style="border: none; border-top: 1px solid #DCCDB4; margin: 24px 0;" />
              <p style="font-size: 12px; color: #A1887F; margin: 0;">
                This is an automated message from CopTrax — NERC Copra Trading's procurement system.
              </p>
            </div>
          </div>
        `,
      });
    } else {
      await sendEmail({
        to:      supplier.email,
        subject: "Update on your CopTrax account registration",
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #3E2723;">
            <div style="background: #2E7D32; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 20px;">NERC Copra Trading</h1>
              <p style="color: #C8E6C9; margin: 4px 0 0; font-size: 13px;">CopTrax Supplier Portal</p>
            </div>
            <div style="background: #FFFEFB; padding: 32px; border: 1px solid #DCCDB4; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; font-weight: 600; margin-top: 0;">Hi ${firstName},</p>
              <p style="line-height: 1.6;">
                Thank you for registering with <strong>NERC Copra Trading</strong>.
              </p>
              <p style="line-height: 1.6;">
                After reviewing your submitted documents, we were unable to approve your
                account at this time. This may be due to incomplete or unclear identification documents.
              </p>
              <p style="line-height: 1.6;">
                If you believe this is a mistake or would like to re-apply, please contact
                NERC Copra Trading directly.
              </p>
              <hr style="border: none; border-top: 1px solid #DCCDB4; margin: 24px 0;" />
              <p style="font-size: 12px; color: #A1887F; margin: 0;">
                This is an automated message from CopTrax — NERC Copra Trading's procurement system.
              </p>
            </div>
          </div>
        `,
      });
    }

    return json({ success: true });
  } catch (err) {
    console.error("[notify-supplier]", err);
    return json({ error: String(err) }, 500);
  }
});
