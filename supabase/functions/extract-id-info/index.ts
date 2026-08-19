import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `This is a Philippine government-issued ID (front side). Extract the following fields and return ONLY valid JSON with exactly these keys:
{"first_name": "...", "last_name": "...", "address": "..."}

Rules:
- first_name: given name(s) only, no middle name, no surname
- last_name: surname/family name only
- address: full permanent address as printed on the ID; if not present use ""
- If a field cannot be read or is not present, use ""
- Return ONLY the JSON object, no explanation, no markdown code fences`;

function toTitleCase(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLocaleLowerCase("en-PH")
    .replace(/(^|[^\p{L}\p{N}])\p{L}/gu, (match) => match.toLocaleUpperCase("en-PH"));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { image_data_url } = await req.json();
    if (!image_data_url) throw new Error("image_data_url is required");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    // Parse data URL: "data:image/jpeg;base64,XXXX"
    const match = image_data_url.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mimeType = match[1];
    const base64Data = match[2];

    const body = JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
      },
    });

    const models = [
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-flash-lite-latest",
    ];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let response: Response | null = null;
    let lastErr = "";
    outer: for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (r.ok) { response = r; break outer; }
        const errText = await r.text();
        lastErr = "Gemini error " + r.status + " (" + model + "): " + errText;
        // Retry only on transient errors (503 overload, 429 rate limit, 500)
        if (r.status !== 503 && r.status !== 429 && r.status !== 500) break;
        await sleep(500 * (attempt + 1));
      }
    }

    if (!response) throw new Error(lastErr || "Gemini request failed");

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { first_name: "", last_name: "", address: "" };
    }

    return new Response(JSON.stringify({
      first_name: toTitleCase(parsed.first_name),
      last_name:  toTitleCase(parsed.last_name),
      address:    toTitleCase(parsed.address),
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
