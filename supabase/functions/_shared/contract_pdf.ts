// _shared/contract_pdf.ts
// -----------------------------------------------------------------------------
// Renders the CopTrax "Copra Purchase Contract" as a PDF using pdf-lib.
// The layout replicates docs/contract_template.docx word-for-word so that the
// generated document is legally identical to the paper template.
//
// The renderer is used by:
//   • generate-contract  — produces an unsigned preview (no signatures).
//   • sign-contract      — produces the final signed PDF (signatures embedded).
// -----------------------------------------------------------------------------

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

// ── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W        = 612;   // US Letter
const PAGE_H        = 792;
const MARGIN_L      = 54;
const MARGIN_R      = 54;
const MARGIN_T      = 60;
const MARGIN_B      = 60;
const CONTENT_W     = PAGE_W - MARGIN_L - MARGIN_R;
const LINE_H        = 14;
const PARA_H        = 6;
const BODY_SIZE     = 10.5;
const TITLE_SIZE    = 16;
const HEAD_SIZE     = 11;

// ── Renderer input ───────────────────────────────────────────────────────────
export interface RenderInput {
  contract_number:        string;
  date_str:               string;    // e.g. "August 16, 2026"
  supplier_name:          string;
  supplier_address:       string;
  contracted_tons:        string;
  negotiated_price:       string;    // numeric with 2 decimals as string
  negotiated_price_words: string;
  due_date_text:          string;
  delivery_location:      string;    // optional extra line
  special_notes:          string;    // optional extra paragraph
  business_owner_name:    string;
  contract_hash:          string;    // included in the audit footer

  // Signature payloads (data URLs OR raw bytes). Provided only for the final
  // signed PDF; omit for the unsigned preview.
  supplier_signature_png?:      Uint8Array | null;
  business_owner_signature_png?: Uint8Array | null;
  supplier_signed_at?:          string;    // ISO
  business_owner_signed_at?:    string;    // ISO
}

// ── Small drawing helpers ────────────────────────────────────────────────────

/** Wrap `text` into lines that fit within `maxWidth`. */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface Cursor { y: number; page: PDFPage; }

/** Ensure `neededPx` fits on the page — if not, start a new page. */
function ensureSpace(
  ctx: RenderContext,
  cur: Cursor,
  neededPx: number,
): Cursor {
  if (cur.y - neededPx >= MARGIN_B) return cur;
  const newPage = ctx.doc.addPage([PAGE_W, PAGE_H]);
  return { y: PAGE_H - MARGIN_T, page: newPage };
}

interface RenderContext {
  doc:  PDFDocument;
  body: PDFFont;
  bold: PDFFont;
}

/** Draw a paragraph, wrapped, returning the new cursor. */
function drawParagraph(
  ctx: RenderContext,
  cur: Cursor,
  text: string,
  opts: { font?: PDFFont; size?: number; indent?: number; extraGap?: number } = {},
): Cursor {
  const font  = opts.font ?? ctx.body;
  const size  = opts.size ?? BODY_SIZE;
  const indent = opts.indent ?? 0;
  const lines  = wrapLines(text, font, size, CONTENT_W - indent);
  let c = cur;
  for (const line of lines) {
    c = ensureSpace(ctx, c, LINE_H);
    c.page.drawText(line, {
      x: MARGIN_L + indent,
      y: c.y - size,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    c = { y: c.y - LINE_H, page: c.page };
  }
  return { y: c.y - (opts.extraGap ?? PARA_H), page: c.page };
}

/** Draw a "LABEL: value" line, label bold, value regular, on one visual line. */
function drawLabelValue(
  ctx: RenderContext,
  cur: Cursor,
  label: string,
  value: string,
): Cursor {
  const c   = ensureSpace(ctx, cur, LINE_H);
  const lw  = ctx.bold.widthOfTextAtSize(label, BODY_SIZE);
  c.page.drawText(label, {
    x: MARGIN_L, y: c.y - BODY_SIZE, size: BODY_SIZE, font: ctx.bold, color: rgb(0, 0, 0),
  });
  // Value may be long — wrap it under the label offset if needed.
  const remainingW = CONTENT_W - lw - 6;
  const lines = wrapLines(value, ctx.body, BODY_SIZE, remainingW);
  if (lines.length > 0) {
    c.page.drawText(lines[0], {
      x: MARGIN_L + lw + 6, y: c.y - BODY_SIZE, size: BODY_SIZE, font: ctx.body, color: rgb(0, 0, 0),
    });
  }
  let next = { y: c.y - LINE_H, page: c.page };
  for (let i = 1; i < lines.length; i++) {
    next = ensureSpace(ctx, next, LINE_H);
    next.page.drawText(lines[i], {
      x: MARGIN_L + lw + 6, y: next.y - BODY_SIZE, size: BODY_SIZE, font: ctx.body, color: rgb(0, 0, 0),
    });
    next = { y: next.y - LINE_H, page: next.page };
  }
  return next;
}

/** Draw an image scaled to fit a given box, top-left anchored at (x, yTop). */
async function drawFittedImage(
  page: PDFPage,
  pdfImg: import("https://esm.sh/pdf-lib@1.17.1").PDFImage,
  x: number,
  yTop: number,
  boxW: number,
  boxH: number,
) {
  const dims = pdfImg.scale(1);
  const scale = Math.min(boxW / dims.width, boxH / dims.height, 1);
  const w = dims.width * scale;
  const h = dims.height * scale;
  page.drawImage(pdfImg, {
    x, y: yTop - h, width: w, height: h,
  });
}

// ── Main render ──────────────────────────────────────────────────────────────

export async function renderContractPDF(input: RenderInput): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: RenderContext = { doc, body, bold };

  const page = doc.addPage([PAGE_W, PAGE_H]);
  let cur: Cursor = { y: PAGE_H - MARGIN_T, page };

  // Title (centered)
  {
    const title = "COPRA PURCHASE CONTRACT";
    const w = bold.widthOfTextAtSize(title, TITLE_SIZE);
    cur.page.drawText(title, {
      x: (PAGE_W - w) / 2, y: cur.y - TITLE_SIZE, size: TITLE_SIZE, font: bold, color: rgb(0, 0, 0),
    });
    cur = { y: cur.y - TITLE_SIZE - 6, page: cur.page };
  }

  // Subtitle (centered)
  {
    const sub = "Purok Waling-Waling, Poblacion, Kumalarang, Zamboanga del Sur";
    const w = body.widthOfTextAtSize(sub, BODY_SIZE);
    cur.page.drawText(sub, {
      x: (PAGE_W - w) / 2, y: cur.y - BODY_SIZE, size: BODY_SIZE, font: body, color: rgb(0, 0, 0),
    });
    cur = { y: cur.y - LINE_H - 8, page: cur.page };
  }

  // Contract # / Date (two columns)
  {
    cur = ensureSpace(ctx, cur, LINE_H);
    cur.page.drawText("Contract #:", {
      x: MARGIN_L, y: cur.y - BODY_SIZE, size: BODY_SIZE, font: bold, color: rgb(0, 0, 0),
    });
    cur.page.drawText(input.contract_number, {
      x: MARGIN_L + 66, y: cur.y - BODY_SIZE, size: BODY_SIZE, font: body, color: rgb(0, 0, 0),
    });
    cur.page.drawText("Date:", {
      x: MARGIN_L + 300, y: cur.y - BODY_SIZE, size: BODY_SIZE, font: bold, color: rgb(0, 0, 0),
    });
    cur.page.drawText(input.date_str, {
      x: MARGIN_L + 335, y: cur.y - BODY_SIZE, size: BODY_SIZE, font: body, color: rgb(0, 0, 0),
    });
    cur = { y: cur.y - LINE_H - 4, page: cur.page };
  }

  cur = drawLabelValue(ctx, cur, "BUYER:", "NERC COPRA TRADING");
  cur = drawLabelValue(ctx, cur, "SELLER:", input.supplier_name);
  cur = drawLabelValue(ctx, cur, "ADDRESS:", input.supplier_address);
  cur = drawLabelValue(
    ctx, cur, "QUANTITY:",
    `${input.contracted_tons} METRIC TONS of 1,000 Kilograms/Metric Ton`,
  );
  cur = drawLabelValue(
    ctx, cur, "PRICE:",
    `${input.negotiated_price_words} (PhP ${input.negotiated_price}) PER KILOGRAM`,
  );

  cur = { y: cur.y - 4, page: cur.page };

  const deliveryClause = input.delivery_location
    ? `Deliver to ${input.delivery_location}.`
    : "Deliver to Poblacion, Kumalarang, Zamboanga del Sur Warehouse.";
  cur = drawParagraph(ctx, cur, deliveryClause);

  cur = drawParagraph(ctx, cur,
    "The BUYER reserves the right to reject any copra which does not meet standard. Deliveries which are so rejected will not be considered to fulfill the SELLER'S obligations under the terms of this contract.",
  );

  cur = drawLabelValue(ctx, cur, "SHIPMENT:", `Not later than ${input.due_date_text}.`);
  cur = drawParagraph(ctx, cur,
    "WEIGHTS: Delivered net resecada weights in BUYER'S warehouse basis moisture meter final (Moisture table and analysis per COPRA MOISTURE (NEW TABLE)).",
  );

  // Section header
  cur = ensureSpace(ctx, cur, LINE_H + 4);
  cur.page.drawText("SPECIAL CONDITIONS", {
    x: MARGIN_L, y: cur.y - HEAD_SIZE, size: HEAD_SIZE, font: bold, color: rgb(0, 0, 0),
  });
  cur = { y: cur.y - LINE_H - 2, page: cur.page };

  cur = drawParagraph(ctx, cur,
    "If the SELLER fails to complete delivery within contract period or to comply with any of the other conditions of this contract, BUYER will have the option to reduce the price to BUYER'S market price on the day of default; or buy copra in the open market for the SELLER'S account and risk, or cancel the portion of the contract pending fulfillment; and SELLER will indemnify BUYER for all the damages sustained by the BUYER by reason of SELLER'S failure to comply with any of the terms of this contract. BUYER will also be entitled to cancel any and all other contracts made with the SELLER prior to subsequent to the date of this contract.",
  );

  cur = drawParagraph(ctx, cur,
    "SELLER agrees to pay BUYER damages, a reasonable sum for attorney's fees and cost of litigation, arising from SELLER's non fulfillment, either totally, or partially, of this contract.",
  );

  cur = drawParagraph(ctx, cur,
    "The neglect or failure of BUYER to enforce any of its rights under this Contract shall not in any way be constructed as a waiver in whole or in part, expressly or impliedly, of such rights.",
  );

  cur = drawParagraph(ctx, cur,
    "Parties agree that suits, if any, founded on or connected with this contract, shall be brought before the competent court of Quezon City, Metro Manila, unless the law specially proves a different venue therefore.",
  );

  if (input.special_notes && input.special_notes.trim()) {
    cur = drawParagraph(ctx, cur, `Additional notes: ${input.special_notes.trim()}`);
  }

  // Confirmation block header
  cur = ensureSpace(ctx, cur, 130);
  cur.page.drawText("CONFIRMED:", {
    x: MARGIN_L, y: cur.y - HEAD_SIZE, size: HEAD_SIZE, font: bold, color: rgb(0, 0, 0),
  });
  cur = { y: cur.y - LINE_H - 8, page: cur.page };

  // Two signature blocks, side by side. Column midpoints:
  const colW  = (CONTENT_W - 40) / 2;
  const leftX  = MARGIN_L;
  const rightX = MARGIN_L + colW + 40;
  const sigBoxTop = cur.y;
  const sigBoxH   = 42;

  // Draw signature images if provided
  if (input.supplier_signature_png) {
    try {
      const img = await doc.embedPng(input.supplier_signature_png);
      await drawFittedImage(cur.page, img, leftX, sigBoxTop, colW, sigBoxH);
    } catch { /* embed may fail if it's actually a JPEG */
      try {
        const img = await doc.embedJpg(input.supplier_signature_png);
        await drawFittedImage(cur.page, img, leftX, sigBoxTop, colW, sigBoxH);
      } catch { /* skip */ }
    }
  }
  if (input.business_owner_signature_png) {
    try {
      const img = await doc.embedPng(input.business_owner_signature_png);
      await drawFittedImage(cur.page, img, rightX, sigBoxTop, colW, sigBoxH);
    } catch {
      try {
        const img = await doc.embedJpg(input.business_owner_signature_png);
        await drawFittedImage(cur.page, img, rightX, sigBoxTop, colW, sigBoxH);
      } catch { /* skip */ }
    }
  }

  const lineY = sigBoxTop - sigBoxH - 2;
  cur.page.drawLine({
    start: { x: leftX,  y: lineY }, end: { x: leftX  + colW, y: lineY },
    thickness: 0.8, color: rgb(0, 0, 0),
  });
  cur.page.drawLine({
    start: { x: rightX, y: lineY }, end: { x: rightX + colW, y: lineY },
    thickness: 0.8, color: rgb(0, 0, 0),
  });

  const nameY = lineY - 14;
  cur.page.drawText(input.supplier_name, {
    x: leftX, y: nameY - BODY_SIZE, size: BODY_SIZE, font: bold, color: rgb(0, 0, 0),
  });
  cur.page.drawText(input.business_owner_name, {
    x: rightX, y: nameY - BODY_SIZE, size: BODY_SIZE, font: bold, color: rgb(0, 0, 0),
  });
  cur.page.drawText("SELLER", {
    x: leftX, y: nameY - BODY_SIZE - LINE_H, size: BODY_SIZE, font: body, color: rgb(0, 0, 0),
  });
  cur.page.drawText("BUYER", {
    x: rightX, y: nameY - BODY_SIZE - LINE_H, size: BODY_SIZE, font: body, color: rgb(0, 0, 0),
  });

  cur = { y: nameY - BODY_SIZE - LINE_H - 20, page: cur.page };

  // Audit footer — visible on every page
  const footerText = input.supplier_signed_at
    ? `Contract Hash: ${input.contract_hash}  •  Signed by Seller at ${input.supplier_signed_at}${
        input.business_owner_signed_at ? `  •  Signed by Buyer at ${input.business_owner_signed_at}` : ""
      }`
    : `Contract Hash: ${input.contract_hash}  •  Unsigned preview — awaiting Seller authorization`;

  for (const p of doc.getPages()) {
    const lines = wrapLines(footerText, body, 7.5, CONTENT_W);
    let y = MARGIN_B - 12;
    for (const line of lines) {
      p.drawText(line, { x: MARGIN_L, y, size: 7.5, font: body, color: rgb(0.35, 0.35, 0.35) });
      y -= 10;
    }
  }

  return await doc.save();
}
