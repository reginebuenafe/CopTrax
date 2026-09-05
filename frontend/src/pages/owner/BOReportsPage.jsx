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

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtWeight(kg) {
  if (kg == null) return "—";
  return Number(kg).toLocaleString("en-PH", { maximumFractionDigits: 2 }) + " kg";
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
      delivery:delivery_id(batch_number, delivery_date)
    `)
    .order("recorded_date", { ascending: false });
  if (from) q.gte("recorded_date", from);
  if (to)   q.lte("recorded_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
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

// ── Preview tables ────────────────────────────────────────────────────────────

function ContractsTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-beige/60 border-b border-beige-dark/30">
          {["Contract #","Supplier","Status","Price/ton","Contracted (t)","Activation","Due Date"].map(h => (
            <th key={h} className="text-left px-3 py-2.5 font-semibold text-brown-light uppercase tracking-wide whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige-dark/10">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-beige/30">
            <td className="px-3 py-2.5 font-medium text-brown-dark">{r.contract_number}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "—"}</td>
            <td className="px-3 py-2.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                r.status === "Active" ? "bg-green-pale text-green-dark" :
                r.status === "Completed" ? "bg-blue-50 text-blue-600" :
                r.status === "Breached" ? "bg-red-50 text-red-600" : "bg-beige text-brown-mid"}`}>
                {r.status}
              </span>
            </td>
            <td className="px-3 py-2.5 text-brown-mid">{peso(r.negotiated_price_per_kg)}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.contracted_tons}</td>
            <td className="px-3 py-2.5 text-brown-mid">{fmtDate(r.activation_date)}</td>
            <td className="px-3 py-2.5 text-brown-mid">{fmtDate(r.due_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeliveriesTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-beige/60 border-b border-beige-dark/30">
          {["Batch #","Date","Supplier","Type","Net Wt","Moisture (cc)","Quality","Allocations"].map(h => (
            <th key={h} className="text-left px-3 py-2.5 font-semibold text-brown-light uppercase tracking-wide whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige-dark/10">
        {rows.map((r, i) => {
          const isWalkin = r.delivery_source === "Walkin";
          const supplier = r.supplier
            ? `${r.supplier.first_name} ${r.supplier.last_name}`
            : r.walkin_supplier
            ? `${r.walkin_supplier.first_name} ${r.walkin_supplier.last_name} (Walk-in)`
            : "—";
          const wr      = r.weighing?.[0];
          const netWt   = wr?.net_weight_kg;
          const moisture = r.lab?.[0]?.moisture_content_pct;

          // Quality: Dry/Wet for walk-in, result badge for contractual
          const condition = wr?.copra_condition;
          const quality   = r.quality?.[0]?.result;

          // Allocations: walk-in shows spot computation; contractual shows alloc lines
          const allocs = (r.allocations ?? []).sort((a, b) => a.sequence_order - b.sequence_order);
          const spotPrice = r.walkin_spot_price_kg != null ? Number(r.walkin_spot_price_kg) : null;
          const amountPaid = r.walkin_amount_paid != null ? Number(r.walkin_amount_paid) : null;

          return (
            <tr key={i} className="hover:bg-beige/30">
              <td className="px-3 py-2.5 font-medium text-brown-dark">{r.batch_number ?? "—"}</td>
              <td className="px-3 py-2.5 text-brown-mid whitespace-nowrap">{fmtDate(r.delivery_date)}</td>
              <td className="px-3 py-2.5 text-brown-mid">{supplier}</td>
              <td className="px-3 py-2.5 text-brown-mid">{r.delivery_source}</td>
              <td className="px-3 py-2.5 text-brown-mid">{fmtWeight(netWt)}</td>
              <td className="px-3 py-2.5 text-brown-mid">{moisture != null ? `${moisture}cc` : "—"}</td>
              <td className="px-3 py-2.5">
                {isWalkin && condition ? (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    condition === "Wet" ? "bg-blue-50 text-blue-600" : "bg-green-pale text-green-dark"}`}>
                    {condition}
                  </span>
                ) : quality ? (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    quality === "Accepted" ? "bg-green-pale text-green-dark" :
                    quality === "Rejected" ? "bg-red-50 text-red-600" : "bg-beige text-brown-mid"}`}>
                    {quality}
                  </span>
                ) : "—"}
              </td>
              <td className="px-3 py-2.5 text-brown-mid">
                {isWalkin ? (
                  spotPrice != null
                    ? <span>Spot: {fmtWeight(netWt)} · {peso(spotPrice)}/kg</span>
                    : "—"
                ) : allocs.length === 0 ? "—" : allocs.map((a, j) => (
                  <div key={j}>{a.contract?.contract_number ?? "Spot"}: {fmtWeight(a.allocated_weight_kg)} ({a.price_type})</div>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InventoryTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-beige/60 border-b border-beige-dark/30">
          {["Delivery","Recorded","Source","Weight","Status","Eligible to Merge","Decision"].map(h => (
            <th key={h} className="text-left px-3 py-2.5 font-semibold text-brown-light uppercase tracking-wide whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige-dark/10">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-beige/30">
            <td className="px-3 py-2.5 font-medium text-brown-dark">{r.delivery?.batch_number ?? "—"}</td>
            <td className="px-3 py-2.5 text-brown-mid whitespace-nowrap">{fmtDate(r.recorded_date)}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.source_type}</td>
            <td className="px-3 py-2.5 text-brown-mid">{fmtWeight(r.weight_kg)}</td>
            <td className="px-3 py-2.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                r.batch_status === "Resecada" ? "bg-green-pale text-green-dark" :
                r.batch_status === "Ready to Merge" ? "bg-amber-50 text-amber-700" : "bg-beige text-brown-mid"}`}>
                {r.batch_status}
              </span>
            </td>
            <td className="px-3 py-2.5 text-brown-mid">{fmtDate(r.merge_eligible_date)}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.review_decision ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaymentsTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-beige/60 border-b border-beige-dark/30">
          {["Reference","Supplier","Date","Net Wt","Moisture (cc)","Final Wt","Payable","Status","Method"].map(h => (
            <th key={h} className="text-left px-3 py-2.5 font-semibold text-brown-light uppercase tracking-wide whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige-dark/10">
        {rows.map((r, i) => {
          const details = r.detail ?? [];
          const totalNetWt    = details.reduce((s, d) => s + (Number(d.net_weight_kg)   || 0), 0);
          const totalFinalWt  = details.reduce((s, d) => s + (Number(d.final_weight_kg) || 0), 0);
          const totalPayable  = details.reduce((s, d) => s + (Number(d.line_amount)     || 0), 0);
          const mcValues      = details.map(d => d.moisture_content_pct).filter(v => v != null);
          const mcDisplay     = mcValues.length === 0 ? "—"
            : mcValues.length === 1 ? `${mcValues[0]}cc`
            : `${(mcValues.reduce((s, v) => s + Number(v), 0) / mcValues.length).toFixed(1)}cc avg`;
          return (
            <tr key={i} className="hover:bg-beige/30">
              <td className="px-3 py-2.5 font-medium text-brown-dark">{r.reference_number ?? "—"}</td>
              <td className="px-3 py-2.5 text-brown-mid">{r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "—"}</td>
              <td className="px-3 py-2.5 text-brown-mid whitespace-nowrap">{fmtDate(r.payment_date)}</td>
              <td className="px-3 py-2.5 text-brown-mid">{fmtWeight(totalNetWt || null)}</td>
              <td className="px-3 py-2.5 text-brown-mid">{mcDisplay}</td>
              <td className="px-3 py-2.5 text-brown-mid">{fmtWeight(totalFinalWt || null)}</td>
              <td className="px-3 py-2.5 font-semibold text-brown-dark">{totalPayable > 0 ? peso(totalPayable) : "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  r.payment_status === "Released" ? "bg-green-pale text-green-dark" :
                  r.payment_status === "Failed"   ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                  {r.payment_status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-brown-mid">{r.payment_method}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RatingsTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-beige/60 border-b border-beige-dark/30">
          {["Supplier","Contract","Date","Fulfillment","Volume","Quality","Score","Rating","Overall"].map(h => (
            <th key={h} className="text-left px-3 py-2.5 font-semibold text-brown-light uppercase tracking-wide whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-beige-dark/10">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-beige/30">
            <td className="px-3 py-2.5 font-medium text-brown-dark">{r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "—"}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.contract?.contract_number ?? "—"}</td>
            <td className="px-3 py-2.5 text-brown-mid whitespace-nowrap">{fmtDate(r.snapshot_date)}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.contract_fulfillment_score != null ? `${r.contract_fulfillment_score}%` : "—"}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.delivered_volume_score != null ? `${r.delivered_volume_score}%` : "—"}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.copra_quality_score != null ? `${r.copra_quality_score}%` : "—"}</td>
            <td className="px-3 py-2.5 text-brown-mid">{r.performance_score != null ? `${Number(r.performance_score).toFixed(1)}%` : "—"}</td>
            <td className="px-3 py-2.5">
              <span className={`font-bold ${r.supplier_rating >= 4 ? "text-green-dark" : r.supplier_rating >= 3 ? "text-amber-600" : "text-red-600"}`}>
                {r.supplier_rating != null ? `${r.supplier_rating} / 5` : "—"}
              </span>
            </td>
            <td className="px-3 py-2.5 font-bold text-brown-dark">
              {r.overall_supplier_rating != null ? `${Number(r.overall_supplier_rating).toFixed(2)} / 5` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportXLSX(reportId, rows) {
  import("xlsx").then(XLSX => {
    let wsData = [];

    if (reportId === "contracts") {
      wsData = [
        ["Contract #", "Supplier", "Email", "Status", "Price/kg (₱)", "Contracted (tons)", "Signing Date", "Activation Date", "Due Date"],
        ...rows.map(r => [
          r.contract_number,
          r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "",
          r.supplier?.email ?? "",
          r.status,
          r.negotiated_price_per_kg,
          r.contracted_tons,
          fmtDate(r.signing_date),
          fmtDate(r.activation_date),
          fmtDate(r.due_date),
        ]),
      ];
    } else if (reportId === "deliveries") {
      wsData = [
        ["Batch #", "Delivery Date", "Source", "Supplier", "Gross Wt (kg)", "Tare Wt (kg)", "Net Wt (kg)", "Moisture (cc)", "Quality", "Allocation Summary"],
        ...rows.map(r => {
          const w = r.weighing?.[0];
          const allocs = (r.allocations ?? []).map(a => `${a.contract?.contract_number ?? "Spot"}: ${a.allocated_weight_kg}kg (${a.price_type})`).join("; ");
          return [
            r.batch_number,
            fmtDate(r.delivery_date),
            r.delivery_source,
            r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : r.walkin_supplier ? `${r.walkin_supplier.first_name} ${r.walkin_supplier.last_name}` : "",
            w?.gross_weight_kg ?? "",
            w?.tare_weight_kg ?? "",
            w?.net_weight_kg ?? "",
            r.lab?.[0]?.moisture_content_pct ?? "",
            r.quality?.[0]?.result ?? "",
            allocs,
          ];
        }),
      ];
    } else if (reportId === "inventory") {
      wsData = [
        ["Delivery Batch #", "Recorded Date", "Source", "Weight (kg)", "Status", "Merge Eligible Date", "Merged At", "Decision"],
        ...rows.map(r => [
          r.delivery?.batch_number ?? "",
          fmtDate(r.recorded_date),
          r.source_type,
          r.weight_kg,
          r.batch_status,
          fmtDate(r.merge_eligible_date),
          fmtDate(r.merged_at),
          r.review_decision ?? "",
        ]),
      ];
    } else if (reportId === "payments") {
      wsData = [
        ["Reference #", "Supplier", "Email", "Payment Date", "Net Wt (kg)", "Moisture (cc)", "Final Wt (kg)", "Payable (₱)", "Status", "Method"],
        ...rows.map(r => {
          const details = r.detail ?? [];
          const totalNetWt   = details.reduce((s, d) => s + (Number(d.net_weight_kg)   || 0), 0);
          const totalFinalWt = details.reduce((s, d) => s + (Number(d.final_weight_kg) || 0), 0);
          const totalPayable = details.reduce((s, d) => s + (Number(d.line_amount)     || 0), 0);
          const mcValues     = details.map(d => d.moisture_content_pct).filter(v => v != null);
          const mcDisplay    = mcValues.length === 0 ? ""
            : mcValues.length === 1 ? mcValues[0]
            : (mcValues.reduce((s, v) => s + Number(v), 0) / mcValues.length).toFixed(1);
          return [
            r.reference_number ?? "",
            r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "",
            r.supplier?.email ?? "",
            fmtDate(r.payment_date),
            totalNetWt   || "",
            mcDisplay,
            totalFinalWt || "",
            totalPayable || "",
            r.payment_status,
            r.payment_method,
          ];
        }),
      ];
    } else if (reportId === "ratings") {
      wsData = [
        ["Supplier", "Email", "Contract #", "Contract Status", "Snapshot Date", "Fulfillment %", "Volume %", "Quality %", "Performance Score", "Rating (1-5)", "Overall Rating"],
        ...rows.map(r => [
          r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "",
          r.supplier?.email ?? "",
          r.contract?.contract_number ?? "",
          r.contract?.status ?? "",
          fmtDate(r.snapshot_date),
          r.contract_fulfillment_score ?? "",
          r.delivered_volume_score ?? "",
          r.copra_quality_score ?? "",
          r.performance_score ?? "",
          r.supplier_rating ?? "",
          r.overall_supplier_rating ?? "",
        ]),
      ];
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `coptrax_${reportId}_report_${new Date().toISOString().split("T")[0]}.xlsx`);
  });
}

function exportPDF(reportId, reportLabel, rows) {
  import("jspdf").then(({ jsPDF }) => {
    import("jspdf-autotable").then(() => {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const dateStr = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("CopTrax · NERC Copra Trading", 14, 16);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(reportLabel, 14, 22);
      doc.text(`Generated: ${dateStr}`, 14, 28);

      let head = [], body = [];

      if (reportId === "contracts") {
        head = [["Contract #","Supplier","Status","Price/kg","Contracted (t)","Activation","Due Date"]];
        body = rows.map(r => [
          r.contract_number, r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "—",
          r.status, peso(r.negotiated_price_per_kg), r.contracted_tons,
          fmtDate(r.activation_date), fmtDate(r.due_date),
        ]);
      } else if (reportId === "deliveries") {
        head = [["Batch #","Date","Supplier","Net Wt","Moisture (cc)","Quality"]];
        body = rows.map(r => [
          r.batch_number, fmtDate(r.delivery_date),
          r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : (r.walkin_supplier ? `${r.walkin_supplier.first_name} ${r.walkin_supplier.last_name}` : "—"),
          fmtWeight(r.weighing?.[0]?.net_weight_kg),
          r.lab?.[0]?.moisture_content_pct != null ? `${r.lab[0].moisture_content_pct}cc` : "—",
          r.quality?.[0]?.result ?? "—",
        ]);
      } else if (reportId === "inventory") {
        head = [["Delivery Batch","Recorded","Source","Weight","Status","Merge Eligible","Decision"]];
        body = rows.map(r => [
          r.delivery?.batch_number ?? "—", fmtDate(r.recorded_date), r.source_type,
          fmtWeight(r.weight_kg), r.batch_status, fmtDate(r.merge_eligible_date), r.review_decision ?? "—",
        ]);
      } else if (reportId === "payments") {
        head = [["Reference #","Supplier","Date","Net Wt","Moisture (cc)","Final Wt","Payable","Status"]];
        body = rows.map(r => {
          const details     = r.detail ?? [];
          const totalNetWt  = details.reduce((s, d) => s + (Number(d.net_weight_kg)   || 0), 0);
          const totalFinalWt= details.reduce((s, d) => s + (Number(d.final_weight_kg) || 0), 0);
          const totalPayable= details.reduce((s, d) => s + (Number(d.line_amount)     || 0), 0);
          const mcValues    = details.map(d => d.moisture_content_pct).filter(v => v != null);
          const mcDisplay   = mcValues.length === 0 ? "—"
            : mcValues.length === 1 ? `${mcValues[0]}cc`
            : `${(mcValues.reduce((s, v) => s + Number(v), 0) / mcValues.length).toFixed(1)}cc avg`;
          return [
            r.reference_number ?? "—",
            r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "—",
            fmtDate(r.payment_date), fmtWeight(totalNetWt || null),
            mcDisplay,
            fmtWeight(totalFinalWt || null), totalPayable > 0 ? peso(totalPayable) : "—",
            r.payment_status,
          ];
        });
      } else if (reportId === "ratings") {
        head = [["Supplier","Contract","Fulfillment","Volume","Quality","Score","Rating","Overall"]];
        body = rows.map(r => [
          r.supplier ? `${r.supplier.first_name} ${r.supplier.last_name}` : "—",
          r.contract?.contract_number ?? "—",
          r.contract_fulfillment_score != null ? `${r.contract_fulfillment_score}%` : "—",
          r.delivered_volume_score != null ? `${r.delivered_volume_score}%` : "—",
          r.copra_quality_score != null ? `${r.copra_quality_score}%` : "—",
          r.performance_score != null ? `${Number(r.performance_score).toFixed(1)}%` : "—",
          r.supplier_rating != null ? `${r.supplier_rating}/5` : "—",
          r.overall_supplier_rating != null ? `${Number(r.overall_supplier_rating).toFixed(2)}/5` : "—",
        ]);
      }

      // jspdf-autotable may not chain from the import — use doc.autoTable if available
      if (typeof doc.autoTable === "function") {
        doc.autoTable({ head, body, startY: 34, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 91, 28] } });
      } else {
        // fallback: print as text
        doc.setFontSize(9);
        let y = 36;
        body.forEach(row => {
          doc.text(row.join("  |  "), 14, y);
          y += 6;
          if (y > 190) { doc.addPage(); y = 14; }
        });
      }

      doc.save(`coptrax_${reportId}_report_${new Date().toISOString().split("T")[0]}.pdf`);
    });
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BOReportsPage() {
  const [selected, setSelected] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deliverySource, setDeliverySource] = useState("All"); // All | Contractual | Walk-in
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

  // Apply source filter for deliveries report
  const displayRows = (selected === "deliveries" && deliverySource !== "All")
    ? rows.filter(r => deliverySource === "Walk-in" ? r.delivery_source === "Walkin" : r.delivery_source !== "Walkin")
    : rows;

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
              onClick={() => { setSelected(r.id); setGenerated(false); setRows([]); setError(""); setDeliverySource("All"); }}
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

          {/* Delivery Type filter — only for Delivery Report */}
          {selected === "deliveries" && (
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Delivery Type</label>
              <div className="flex gap-3 border-b border-beige-dark/40 overflow-x-auto">
                {["All", "Contractual", "Walk-in"].map(s => (
                  <button key={s} onClick={() => setDeliverySource(s)}
                    className={`pb-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                      deliverySource === s ? "border-green-dark text-green-dark" : "border-transparent text-brown-light hover:text-brown-mid"
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
                onClick={() => exportXLSX(selected, displayRows)}
                className="flex w-full items-center justify-center gap-2 bg-green-pale text-green-dark font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-green-mid/20 transition-all border border-green-dark/20 sm:w-auto">
                <LuDownload className="w-4 h-4" /> Export .xlsx
              </button>
              <button
                onClick={() => exportPDF(selected, reportMeta?.label ?? "Report", displayRows)}
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
              {selected === "contracts"  && <ContractsTable  rows={displayRows} />}
              {selected === "deliveries" && <DeliveriesTable rows={displayRows} />}
              {selected === "inventory"  && <InventoryTable  rows={displayRows} />}
              {selected === "payments"   && <PaymentsTable   rows={displayRows} />}
              {selected === "ratings"    && <RatingsTable    rows={displayRows} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
