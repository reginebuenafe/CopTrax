// _shared/send_email.ts
// Sends a transactional email via Resend API.
// Uses onboarding@resend.dev as the sender (Resend test/sandbox mode).
// Replace FROM_ADDRESS with a verified domain address before going to production.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS   = "NERC Copra Trading <onboarding@resend.dev>";

export interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
}

export async function sendEmail({ to, subject, html }: EmailPayload): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[sendEmail] RESEND_API_KEY not set — email skipped");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[sendEmail] Resend error ${res.status}:`, body);
    } else {
      console.log(`[sendEmail] Sent to ${to}: "${subject}"`);
    }
  } catch (err) {
    // Never let an email failure crash the calling function
    console.error("[sendEmail] Unexpected error:", err);
  }
}
