import { useState } from "react";
import {
  LuFileChartColumn, LuDownload, LuLoader, LuFilter,
  LuFileText, LuTruck, LuPackage, LuWallet, LuStar,
  LuCircleAlert,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

// ── Helpers ───────────────────────────────────────────────────────────────────

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// jsPDF's built-in "helvetica" font only supports WinAnsi-encoded glyphs and
// has no ₱ (U+20B1) glyph — rendering it garbles into stray characters.
// PDF cell/body text must use this "PHP " prefix instead; the on-screen
// table and XLSX (browser/Excel Unicode fonts) keep the real ₱ symbol via
// peso() above.
function pesoPdf(n) {
  return "PHP " + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtKg(kg) {
  if (kg == null || kg === "") return "—";
  return Number(kg).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
}

function fmtTons(kg) {
  if (kg == null || kg === "") return "—";
  return (Number(kg) / 1000).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " t";
}

// ── Report definitions ────────────────────────────────────────────────────────

const REPORTS = [
  {
    id: "contracts",
    label: "Procurement Contract Report",
    icon: LuFileText,
    color: "bg-blue-50 text-blue-600",
    description: "All contracts with status, supplier, price, quantity, and delivery timeline.",
  },
  {
    id: "deliveries",
    label: "Delivery Report",
    icon: LuTruck,
    color: "bg-green-pale text-green-dark",
    description: "All delivery records with weights, quality results, and contract allocations.",
  },
  {
    id: "inventory",
    label: "Inventory Report",
    icon: LuPackage,
    color: "bg-purple-50 text-purple-600",
    description: "Inventory batches: Walk-in Holding, Ready to Merge, and Resecada pool.",
  },
  {
    id: "payments",
    label: "Payment Report",
    icon: LuWallet,
    color: "bg-amber-50 text-amber-600",
    description: "Payment transactions with amounts, status, and per-delivery details.",
  },
  {
    id: "ratings",
    label: "Supplier Performance Report",
    icon: LuStar,
    color: "bg-orange-50 text-orange-600",
    description: "Supplier ratings with fulfillment, volume, quality scores, and overall rating.",
  },
];

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchContracts(from, to) {
  const q = supabase
    .from("contracts")
    .select(`
      contract_number, status, negotiated_price_per_kg, contracted_tons,
      signing_date, activation_date, due_date, created_at,
      supplier:supplier_id(first_name, last_name, email),
      owner:business_owner_id(first_name, last_name)
    `)
    .order("created_at", { ascending: false });
  if (from) q.gte("created_at", from + "T00:00:00Z");
  if (to)   q.lte("created_at", to   + "T23:59:59Z");
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function fetchDeliveries(from, to) {
  const q = supabase
    .from("deliveries")
    .select(`
      batch_number, delivery_date, delivery_source, delivery_status, created_at,
      truck_plate_number, walkin_spot_price_kg, walkin_amount_paid,
      supplier:supplier_id(first_name, last_name),
      walkin_supplier:walkin_supplier_id(first_name, last_name),
      weighing:weighing_records(gross_weight_kg, tare_weight_kg, net_weight_kg, copra_condition),
      lab:laboratory_inspections(moisture_content_pct),
      quality:quality_results(result, remarks),
      allocations:delivery_allocations(
        allocated_weight_kg, price_type, sequence_order,
        contract:contract_id(contract_number)
      )
    `)
    .order("delivery_date", { ascending: false });
  if (from) q.gte("delivery_date", from);
  if (to)   q.lte("delivery_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function fetchInventory(from, to) {
  const q = supabase
    .from("inventory_batches")
    .select(`
      source_type, batch_status, weight_kg, recorded_date, merge_eligible_date,
      merged_at, review_decision,
      delivery:delivery_id(batch_number, delivery_date, weighing_records(net_weight_kg))
    `)
    .order("recorded_date", { ascending: false });
  if (from) q.gte("recorded_date", from);
  if (to)   q.lte("recorded_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Pre-deduction Net Weight (Gross − Tare) for an inventory batch's own
// delivery — NOT the post-PCA-deduction weight_kg stored on
// inventory_batches. Rejected deliveries never produce inventory_batches
// rows (see InspectionQueuePage.jsx), and each delivery contributes
// exactly one inventory_batches row regardless of how many contracts it
// was split across, so summing this per unique row can never include a
// rejected delivery or double-count a multi-contract batch.
function inventoryNetWeightKg(row) {
  const wr = Array.isArray(row.delivery?.weighing_records) ? row.delivery.weighing_records[0] : row.delivery?.weighing_records;
  return Number(wr?.net_weight_kg ?? 0);
}

async function fetchPayments(from, to) {
  const q = supabase
    .from("payments")
    .select(`
      reference_number, payment_date, payment_status, payment_method, created_at,
      supplier:supplier_id(first_name, last_name, email),
      detail:payment_details(
        gross_weight_kg, tare_weight_kg, net_weight_kg, moisture_content_pct,
        final_weight_kg, line_amount
      )
    `)
    .order("created_at", { ascending: false });
  if (from) q.gte("created_at", from + "T00:00:00Z");
  if (to)   q.lte("created_at", to   + "T23:59:59Z");
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function fetchRatings(from, to) {
  const q = supabase
    .from("supplier_performance_snapshot")
    .select(`
      snapshot_date, contract_fulfillment_score, delivered_volume_score,
      copra_quality_score, performance_score, supplier_rating, overall_supplier_rating,
      supplier:supplier_id(first_name, last_name, email),
      contract:contract_id(contract_number, status)
    `)
    .order("snapshot_date", { ascending: false });
  if (from) q.gte("snapshot_date", from);
  if (to)   q.lte("snapshot_date", to);
  const { data, error } = await q;
  if (error) throw error;

  // Deduplicate: keep only the latest snapshot per (supplier email + contract number)
  const seen = new Set();
  return (data ?? []).filter(row => {
    const key = `${row.supplier?.email ?? ""}::${row.contract?.contract_number ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Column model ──────────────────────────────────────────────────────────────
// Single source of truth per report: the same column list drives the on-screen
// preview table, the PDF (via jspdf-autotable), and the XLSX export, so all
// three surfaces always show the exact same records/columns/totals.
//
// Each column's get(row) returns { text, raw, numFmt, align }:
//   text   – human-readable string for the on-screen table and the PDF body
//   raw    – the underlying value written into the XLSX cell (number/Date/string)
//   numFmt – optional Excel number format applied to that XLSX cell
//   align  – "left" | "right" (defaults to left)

function textCol(header, get) {
  return {
    header, align: "left",
    get: row => { const v = get(row); return { text: v == null || v === "" ? "—" : String(v), raw: v ?? "" }; },
  };
}

function dateCol(header, get) {
  return {
    header, align: "left",
    get: row => {
      const v = get(row);
      return { text: fmtDate(v), raw: v ? new Date(v) : "", numFmt: v ? "yyyy-mm-dd" : undefined };
    },
  };
}

function currencyCol(header, get) {
  return {
    header, align: "right",
    get: row => {
      const v = get(row);
      if (v == null || v === "") return { text: "—", pdfText: "—", raw: "" };
      return { text: peso(v), pdfText: pesoPdf(v), raw: Number(v), numFmt: '"₱"#,##0.00' };
    },
  };
}

// value is already stored in kilograms
function kgCol(header, get) {
  return {
    header, align: "right",
    get: row => {
      const v = get(row);
      return { text: fmtKg(v), raw: v == null || v === "" ? "" : Number(v), numFmt: '#,##0.00" kg"' };
    },
  };
}

// value is already stored in tons (no kg→t conversion)
function tonsDirectCol(header, get) {
  return {
    header, align: "right",
    get: row => {
      const v = get(row);
      return {
        text: v == null || v === "" ? "—" : `${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`,
        raw: v == null || v === "" ? "" : Number(v),
        numFmt: '#,##0.00" t"',
      };
    },
  };
}

function percentCol(header, get) {
  return {
    header, align: "right",
    get: row => {
      const v = get(row);
      return { text: v == null || v === "" ? "—" : `${v}%`, raw: v == null || v === "" ? "" : Number(v), numFmt: '0.0"%"' };
    },
  };
}

function moistureCol(header, get) {
  return {
    header, align: "right",
    get: row => {
      const v = get(row);
      return { text: v == null || v === "" ? "—" : `${v}cc`, raw: v == null || v === "" ? "" : Number(v), numFmt: '0.0"cc"' };
    },
  };
}

function scoreCol(header, get, decimals, suffix) {
  return {
    header, align: "right",
    get: row => {
      const v = get(row);
      return {
        text: v == null || v === "" ? "—" : `${Number(v).toFixed(decimals)}${suffix}`,
        raw: v == null || v === "" ? "" : Number(v),
        numFmt: `0.${"0".repeat(decimals)}"${suffix}"`,
      };
    },
  };
}

// ── Report-specific helpers ───────────────────────────────────────────────────

function supplierName(r) {
  if (r.supplier) return `${r.supplier.first_name ?? ""} ${r.supplier.last_name ?? ""}`.trim();
  if (r.walkin_supplier) return `${r.walkin_supplier.first_name ?? ""} ${r.walkin_supplier.last_name ?? ""}`.trim() + " (Walk-in)";
  return null;
}

function deliveryQualityText(r) {
  const isWalkin = r.delivery_source === "Walkin";
  const condition = r.weighing?.[0]?.copra_condition;
  const quality = r.quality?.[0]?.result;
  if (isWalkin) return condition ?? null;
  return quality ?? null;
}

function deliveryAllocationSummary(r, forPdf = false) {
  const pesoFmt = forPdf ? pesoPdf : peso;
  const isWalkin = r.delivery_source === "Walkin";
  if (isWalkin) {
    const spotPrice = r.walkin_spot_price_kg != null ? Number(r.walkin_spot_price_kg) : null;
    const amountPaid = r.walkin_amount_paid != null ? Number(r.walkin_amount_paid) : null;
    const netWt = r.weighing?.[0]?.net_weight_kg;
    if (spotPrice == null) return null;
    return `Spot: ${fmtKg(netWt)} @ ${pesoFmt(spotPrice)}/kg${amountPaid != null ? ` = ${pesoFmt(amountPaid)}` : ""}`;
  }
  const allocs = (r.allocations ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order);
  if (allocs.length === 0) return null;
  return allocs.map(a => `${a.contract?.contract_number ?? "Spot"}: ${fmtKg(a.allocated_weight_kg)} (${a.price_type})`).join("; ");
}

function paymentDetailTotals(r) {
  const details = r.detail ?? [];
  const totalNetWt = details.reduce((s, d) => s + (Number(d.net_weight_kg) || 0), 0);
  const totalFinalWt = details.reduce((s, d) => s + (Number(d.final_weight_kg) || 0), 0);
  const totalPayable = details.reduce((s, d) => s + (Number(d.line_amount) || 0), 0);
  const mcValues = details.map(d => d.moisture_content_pct).filter(v => v != null);
  const avgMc = mcValues.length === 0 ? null : mcValues.reduce((s, v) => s + Number(v), 0) / mcValues.length;
  return { totalNetWt, totalFinalWt, totalPayable, avgMc };
}

// ── Column configs (single source of truth for screen/PDF/XLSX) ─────────────

const CONTRACTS_COLUMNS = [
  textCol("Contract #", r => r.contract_number),
  textCol("Supplier", r => supplierName(r)),
  textCol("Email", r => r.supplier?.email),
  textCol("Status", r => r.status),
  currencyCol("Price/kg", r => r.negotiated_price_per_kg),
  tonsDirectCol("Contracted", r => r.contracted_tons),
  dateCol("Signing Date", r => r.signing_date),
  dateCol("Activation Date", r => r.activation_date),
  dateCol("Due Date", r => r.due_date),
];

const DELIVERIES_COLUMNS = [
  textCol("Batch #", r => r.batch_number),
  dateCol("Date", r => r.delivery_date),
  textCol("Type", r => (r.delivery_source === "Walkin" ? "Walk-in" : "Contractual")),
  textCol("Supplier", r => supplierName(r)),
  kgCol("Gross Wt", r => r.weighing?.[0]?.gross_weight_kg),
  kgCol("Tare Wt", r => r.weighing?.[0]?.tare_weight_kg),
  kgCol("Net Wt", r => r.weighing?.[0]?.net_weight_kg),
  moistureCol("Moisture", r => r.lab?.[0]?.moisture_content_pct),
  textCol("Quality", r => deliveryQualityText(r)),
  {
    header: "Allocation Summary", align: "left",
    get: row => {
      const text = deliveryAllocationSummary(row, false);
      const pdfText = deliveryAllocationSummary(row, true);
      return { text: text ?? "—", pdfText: pdfText ?? "—", raw: text ?? "" };
    },
  },
];

// Inventory's weight columns are unit-aware per row (Contractual → tons,
// Walk-in → kg, per the non-negotiable display convention), so they use a
// bespoke get() instead of the static kgCol/tonsDirectCol factories.
function inventoryWeightCol(header, getKg) {
  return {
    header, align: "right",
    get: row => {
      const kg = getKg(row);
      const isContractual = row.source_type !== "Walkin";
      if (kg == null) return { text: "—", raw: "" };
      return isContractual
        ? { text: fmtTons(kg), raw: kg / 1000, numFmt: '#,##0.00" t"' }
        : { text: fmtKg(kg), raw: kg, numFmt: '#,##0.00" kg"' };
    },
  };
}

const INVENTORY_COLUMNS = [
  textCol("Delivery Batch #", r => r.delivery?.batch_number),
  dateCol("Recorded Date", r => r.recorded_date),
  textCol("Source", r => (r.source_type === "Walkin" ? "Walk-in" : "Contractual")),
  inventoryWeightCol("Net Weight", r => inventoryNetWeightKg(r)),
  inventoryWeightCol("After Deduction", r => Number(r.weight_kg ?? 0)),
  textCol("Status", r => r.batch_status),
  dateCol("Merge Eligible", r => r.merge_eligible_date),
  dateCol("Merged At", r => r.merged_at),
  textCol("Decision", r => r.review_decision),
];

const PAYMENTS_COLUMNS = [
  textCol("Reference #", r => r.reference_number),
  textCol("Supplier", r => supplierName(r)),
  textCol("Email", r => r.supplier?.email),
  dateCol("Payment Date", r => r.payment_date),
  kgCol("Net Wt", r => paymentDetailTotals(r).totalNetWt || null),
  moistureCol("Moisture", r => { const v = paymentDetailTotals(r).avgMc; return v == null ? null : Number(v.toFixed(1)); }),
  kgCol("Final Wt", r => paymentDetailTotals(r).totalFinalWt || null),
  currencyCol("Payable", r => paymentDetailTotals(r).totalPayable || null),
  textCol("Status", r => r.payment_status),
  textCol("Method", r => r.payment_method),
];

const RATINGS_COLUMNS = [
  textCol("Supplier", r => supplierName(r)),
  textCol("Email", r => r.supplier?.email),
  textCol("Contract #", r => r.contract?.contract_number),
  textCol("Contract Status", r => r.contract?.status),
  dateCol("Snapshot Date", r => r.snapshot_date),
  percentCol("Fulfillment", r => r.contract_fulfillment_score),
  percentCol("Volume", r => r.delivered_volume_score),
  percentCol("Quality", r => r.copra_quality_score),
  scoreCol("Performance Score", r => r.performance_score, 1, "%"),
  scoreCol("Rating", r => r.supplier_rating, 0, "/5"),
  scoreCol("Overall Rating", r => r.overall_supplier_rating, 2, "/5"),
];

const REPORT_COLUMNS = {
  contracts: CONTRACTS_COLUMNS,
  deliveries: DELIVERIES_COLUMNS,
  inventory: INVENTORY_COLUMNS,
  payments: PAYMENTS_COLUMNS,
  ratings: RATINGS_COLUMNS,
};

// ── Inventory Total Net Weight (shared by screen, PDF, XLSX) ─────────────────
// Computed from ALL fetched inventory rows (before the Delivery Type filter is
// applied for display), split by source_type, so "All" can always show both
// subtotals regardless of which filter is currently selected on screen.
function computeInventoryNetTotals(allRows) {
  const contractualRows = allRows.filter(r => r.source_type !== "Walkin");
  const walkinRows = allRows.filter(r => r.source_type === "Walkin");
  // All sums use unrounded kg values; rounding happens only at display time
  // (fmtTons/fmtKg), per the "round only for display" requirement.
  const contractualNetKg = contractualRows.reduce((s, r) => s + inventoryNetWeightKg(r), 0);
  const walkinNetKg = walkinRows.reduce((s, r) => s + inventoryNetWeightKg(r), 0);
  const contractualAfterDeductionKg = contractualRows.reduce((s, r) => s + Number(r.weight_kg ?? 0), 0);
  const walkinAfterDeductionKg = walkinRows.reduce((s, r) => s + Number(r.weight_kg ?? 0), 0);
  return { contractualNetKg, walkinNetKg, contractualAfterDeductionKg, walkinAfterDeductionKg };
}

function inventoryTotalsLines(allRows, deliveryTypeFilter) {
  const { contractualNetKg, walkinNetKg, contractualAfterDeductionKg, walkinAfterDeductionKg } = computeInventoryNetTotals(allRows);

  if (deliveryTypeFilter === "Contractual") {
    const diffKg = contractualNetKg - contractualAfterDeductionKg;
    return [
      `Total Net Weight: ${fmtTons(contractualNetKg)}`,
      `Total After Deduction: ${fmtTons(contractualAfterDeductionKg)}`,
      `Weight Difference: ${fmtTons(diffKg)}`,
    ];
  }
  if (deliveryTypeFilter === "Walk-in") {
    const diffKg = walkinNetKg - walkinAfterDeductionKg;
    return [
      `Total Net Weight: ${fmtKg(walkinNetKg)}`,
      `Total After Deduction: ${fmtKg(walkinAfterDeductionKg)}`,
      `Weight Difference: ${fmtKg(diffKg)}`,
    ];
  }

  // "All" — never add tons and kilograms directly; keep Contractual/Walk-in
  // subtotals in their own units, then convert both to a common unit (tons)
  // for one clearly-labeled combined figure per metric.
  const toTons = kg => (kg / 1000).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const combinedNetKg = contractualNetKg + walkinNetKg;
  const combinedAfterDeductionKg = contractualAfterDeductionKg + walkinAfterDeductionKg;
  const combinedDiffKg = combinedNetKg - combinedAfterDeductionKg;
  return [
    `Contractual Subtotal (Net Weight): ${fmtTons(contractualNetKg)}`,
    `Walk-in Subtotal (Net Weight): ${fmtKg(walkinNetKg)}`,
    `Combined Total Net Weight: ${toTons(combinedNetKg)} t`,
    `Contractual Subtotal (After Deduction): ${fmtTons(contractualAfterDeductionKg)}`,
    `Walk-in Subtotal (After Deduction): ${fmtKg(walkinAfterDeductionKg)}`,
    `Combined Total After Deduction: ${toTons(combinedAfterDeductionKg)} t`,
    `Combined Weight Difference: ${toTons(combinedDiffKg)} t`,
  ];
}

// ── On-screen preview table (shared renderer for all 5 reports) ─────────────

function ReportTable({ reportId, rows, totalsLines }) {
  const columns = REPORT_COLUMNS[reportId];
  if (!columns) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-beige/60 border-b border-beige-dark/30">
          {columns.map(c => (
            <th key={c.header} className={`px-3 py-2.5 font-semibold text-brown-light uppercase tracking-wide whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige-dark/10">
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-beige/30">
            {columns.map(c => (
              <td key={c.header} className={`px-3 py-2.5 text-brown-mid whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.get(row).text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totalsLines && totalsLines.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-green-dark/30 bg-green-pale/40">
            <td colSpan={columns.length} className="px-3 py-2.5">
              {totalsLines.map((line, i) => (
                <p key={i} className="text-sm font-bold text-green-dark">{line}</p>
              ))}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

const XLSX_HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
  fill: { fgColor: { rgb: "2E5B1C" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "B8A88A" } },
    bottom: { style: "thin", color: { rgb: "B8A88A" } },
    left: { style: "thin", color: { rgb: "B8A88A" } },
    right: { style: "thin", color: { rgb: "B8A88A" } },
  },
};

function xlsxBodyCellStyle(align) {
  return {
    alignment: { horizontal: align === "right" ? "right" : "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E4D5BD" } },
      bottom: { style: "thin", color: { rgb: "E4D5BD" } },
      left: { style: "thin", color: { rgb: "E4D5BD" } },
      right: { style: "thin", color: { rgb: "E4D5BD" } },
    },
  };
}

async function exportXLSX(reportId, reportLabel, rows, filterDescription, totalsLines) {
  const XLSX = (await import("xlsx-js-style")).default ?? await import("xlsx-js-style");
  const columns = REPORT_COLUMNS[reportId];
  if (!columns) return;

  const dateStr = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const metaRows = [
    ["CopTrax · NERC Copra Trading"],
    [reportLabel],
    [`Generated: ${dateStr}`],
    ...(filterDescription ? [[filterDescription]] : []),
    [],
  ];
  const headerRowIndex = metaRows.length;
  const headerRow = columns.map(c => c.header);
  const cellMeta = rows.map(row => columns.map(c => c.get(row)));
  const bodyRows = cellMeta.map(cells => cells.map(c => c.raw));

  const aoa = [...metaRows, headerRow, ...bodyRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = columns.map(c => ({ wch: Math.max(14, c.header.length + 4) }));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } },
  ];

  const titleAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[titleAddr]) ws[titleAddr].s = { font: { bold: true, sz: 14, color: { rgb: "2E5B1C" } } };
  const subtitleAddr = XLSX.utils.encode_cell({ r: 1, c: 0 });
  if (ws[subtitleAddr]) ws[subtitleAddr].s = { font: { bold: true, sz: 11 } };

  for (let c = 0; c < columns.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    if (ws[addr]) ws[addr].s = XLSX_HEADER_STYLE;
  }

  bodyRows.forEach((rowVals, rIdx) => {
    const r = headerRowIndex + 1 + rIdx;
    columns.forEach((col, cIdx) => {
      const addr = XLSX.utils.encode_cell({ r, c: cIdx });
      if (!ws[addr]) return;
      ws[addr].s = xlsxBodyCellStyle(col.align);
      const meta = cellMeta[rIdx][cIdx];
      if (meta.numFmt) ws[addr].z = meta.numFmt;
    });
  });

  // Totals block (Inventory report) appended after the data rows.
  if (totalsLines && totalsLines.length > 0) {
    const totalsStartRow = headerRowIndex + 1 + bodyRows.length + 1;
    totalsLines.forEach((line, i) => {
      const r = totalsStartRow + i;
      XLSX.utils.sheet_add_aoa(ws, [[line]], { origin: { r, c: 0 } });
      ws["!merges"].push({ s: { r, c: 0 }, e: { r, c: columns.length - 1 } });
      const addr = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: "2E5B1C" } } };
    });
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalsStartRow + totalsLines.length - 1, c: columns.length - 1 } });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `coptrax_${reportId}_report_${new Date().toISOString().split("T")[0]}.xlsx`);
}

async function exportPDF(reportId, reportLabel, rows, filterDescription, totalsLines) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const columns = REPORT_COLUMNS[reportId];
  if (!columns) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dateStr = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(46, 91, 28);
  doc.text("CopTrax · NERC Copra Trading", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 45, 40);
  doc.text(reportLabel, margin, 20);
  doc.setFontSize(8.5);
  doc.setTextColor(120, 105, 95);
  doc.text(`Generated: ${dateStr}`, margin, 25);
  let startY = 30;
  if (filterDescription) {
    doc.text(filterDescription, margin, startY);
    startY += 5;
  }

  const head = [columns.map(c => c.header)];
  const body = rows.map(row => columns.map(c => { const cell = c.get(row); return cell.pdfText ?? cell.text; }));

  autoTable(doc, {
    head,
    body,
    startY: startY + 2,
    margin: { top: startY + 2, left: margin, right: margin, bottom: 16 },
    styles: { fontSize: 8, cellPadding: 2.2, valign: "middle", overflow: "linebreak", lineColor: [228, 213, 189], lineWidth: 0.1 },
    headStyles: { fillColor: [46, 91, 28], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: [247, 241, 232] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align === "right" ? "right" : "left" }])),
  });

  // Totals block (Inventory report) drawn below the table, wrapping to a new
  // page if there isn't enough room left on the current one.
  if (totalsLines && totalsLines.length > 0) {
    let y = (doc.lastAutoTable?.finalY ?? startY + 2) + 8;
    const neededHeight = totalsLines.length * 6 + 6;
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin + 6;
    }
    doc.setDrawColor(46, 91, 28);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 4, pageWidth - margin, y - 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(46, 91, 28);
    totalsLines.forEach(line => {
      doc.text(line, margin, y);
      y += 6;
    });
  }

  // Page numbers on every page, added last so pagination is final and correct.
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 135, 125);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 22, pageHeight - 6);
  }

  doc.save(`coptrax_${reportId}_report_${new Date().toISOString().split("T")[0]}.pdf`);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BOReportsPage() {
  const [selected, setSelected] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("All"); // All | Contractual | Walk-in
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);

  async function generate() {
    if (!selected) return;
    setLoading(true);
    setError("");
    setRows([]);
    setGenerated(false);
    try {
      let data = [];
      if (selected === "contracts") data = await fetchContracts(dateFrom, dateTo);
      else if (selected === "deliveries") data = await fetchDeliveries(dateFrom, dateTo);
      else if (selected === "inventory")  data = await fetchInventory(dateFrom, dateTo);
      else if (selected === "payments")   data = await fetchPayments(dateFrom, dateTo);
      else if (selected === "ratings")    data = await fetchRatings(dateFrom, dateTo);
      setRows(data);
      setGenerated(true);
    } catch (e) {
      setError(e.message ?? "Failed to load report data.");
    }
    setLoading(false);
  }

  const reportMeta = REPORTS.find(r => r.id === selected);
  const showDeliveryTypeFilter = selected === "deliveries" || selected === "inventory";

  // Apply the Delivery Type filter consistently — Deliveries uses
  // `delivery_source` ("Walkin" | "Contract-based"), Inventory uses
  // `source_type` ("Walkin" | "Contractual"); both compare against the
  // same "All" | "Contractual" | "Walk-in" selector.
  const displayRows = (showDeliveryTypeFilter && deliveryTypeFilter !== "All")
    ? rows.filter(r => {
        const isWalkin = selected === "deliveries" ? r.delivery_source === "Walkin" : r.source_type === "Walkin";
        return deliveryTypeFilter === "Walk-in" ? isWalkin : !isWalkin;
      })
    : rows;

  // Inventory Report's Total Net Weight — computed from every fetched row
  // (not just the currently-displayed/filtered subset) so "All" can always
  // show both the Contractual and Walk-in subtotals.
  const totalsLines = selected === "inventory" && generated
    ? inventoryTotalsLines(rows, deliveryTypeFilter)
    : null;

  const dateRangeLabel = dateFrom || dateTo
    ? `Date range: ${dateFrom ? fmtDate(dateFrom) : "…"} – ${dateTo ? fmtDate(dateTo) : "…"}`
    : "Date range: All dates";
  const filterDescription = showDeliveryTypeFilter
    ? `${dateRangeLabel} · Delivery Type: ${deliveryTypeFilter}`
    : dateRangeLabel;

  const inputCls = "w-full px-3 py-2 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark " +
    "focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all";

  return (
    <div className="pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-brown-dark">Reports</h1>
          <p className="text-brown-light text-sm mt-0.5">Generate and export procurement reports</p>
        </div>
        <span className="text-xs text-brown-light">{REPORTS.length} report types</span>
      </div>

      {/* Report type selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const isActive = selected === r.id;
          return (
            <button
              key={r.id}
              onClick={() => { setSelected(r.id); setGenerated(false); setRows([]); setError(""); setDeliveryTypeFilter("All"); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                isActive ? "bg-green-dark text-white border-green-dark" : "bg-white text-brown-mid border-beige-dark/60 hover:border-brown-light hover:text-brown-dark"
              }`}
            >
              <Icon className="w-4 h-4" />
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Filters + generate */}
      <div className="bg-white border border-beige-dark/40 rounded-xl p-5 mb-5">

        {/* ── Date Range heading ── */}
        <div className="flex items-center gap-2 mb-4">
          <LuFilter className="w-3.5 h-3.5 text-brown-light" />
          <p className="text-xs font-bold text-brown-light uppercase tracking-wide">Date Range</p>
        </div>

        {/* ── Filter row: From · To · Generate ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* From */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-brown-dark mb-1.5">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>

          {/* To */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-brown-dark mb-1.5">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>

          {/* Delivery Type filter — Delivery Report and Inventory Report */}
          {showDeliveryTypeFilter && (
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Delivery Type</label>
              <div className="flex gap-3 border-b border-beige-dark/40 overflow-x-auto">
                {["All", "Contractual", "Walk-in"].map(s => (
                  <button key={s} onClick={() => setDeliveryTypeFilter(s)}
                    className={`pb-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                      deliveryTypeFilter === s ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generate Report */}
          <div className="sm:shrink-0">
            <button
              onClick={generate}
              disabled={!selected || loading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-green-dark text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-green-dark/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <LuLoader className="w-4 h-4 animate-spin" /> : <LuFileChartColumn className="w-4 h-4" />}
              Generate Report
            </button>
          </div>
        </div>

        {!selected && (
          <p className="text-xs text-brown-light mt-3">Select a report type above before generating.</p>
        )}

        {/* ── Export actions (only when data is ready) ── */}
        {generated && displayRows.length > 0 && (
          <div className="mt-4 pt-4 border-t border-beige-dark/30 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-brown-light uppercase tracking-wide">Export Report</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                onClick={() => exportXLSX(selected, reportMeta?.label ?? "Report", displayRows, filterDescription, totalsLines)}
                className="flex w-full items-center justify-center gap-2 bg-green-pale text-green-dark font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-green-mid/20 transition-all border border-green-dark/20 sm:w-auto">
                <LuDownload className="w-4 h-4" /> Export .xlsx
              </button>
              <button
                onClick={() => exportPDF(selected, reportMeta?.label ?? "Report", displayRows, filterDescription, totalsLines)}
                className="flex w-full items-center justify-center gap-2 bg-amber-50 text-amber-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-amber-100 transition-all border border-amber-200 sm:w-auto">
                <LuDownload className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
          <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Results table */}
      {generated && (
        <div className="bg-white border border-beige-dark/40 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-beige-dark/20">
            <p className="font-bold text-brown-dark text-sm">{reportMeta?.label}</p>
            <span className="text-xs text-brown-light">{displayRows.length} records</span>
          </div>
          {displayRows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-brown-mid font-semibold text-sm">No records found</p>
              <p className="text-brown-light text-xs mt-1">Try adjusting the date range or check that data exists.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <ReportTable reportId={selected} rows={displayRows} totalsLines={totalsLines} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
