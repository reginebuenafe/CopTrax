import { useEffect, useState } from "react";
import {
  LuFlaskConical, LuTruck, LuFileText, LuCheck, LuX,
  LuCircleAlert, LuArrowLeft, LuDroplets,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function InspectionQueuePage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // delivery being inspected
  const [moisture, setMoisture] = useState("");
  const [preview, setPreview] = useState(null);  // { discountValue, result }
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => { fetchQueue(); }, []);

  async function fetchQueue() {
    setLoading(true);
    const { data } = await supabase
      .from("deliveries")
      .select(`
        delivery_id, delivery_source, delivery_date, delivery_status, created_at,
        supplier:supplier_id(user_id, first_name, last_name),
        contract:contract_id(contract_number),
        delivery_allocations(contract_id, contract:contract_id(contract_number)),
        walkin_supplier:walkin_supplier_id(first_name, last_name),
        weighing_records(net_weight_kg)
      `)
      .eq("delivery_status", "Weighed")
      .eq("delivery_source", "Contract-based")
      .order("created_at", { ascending: true });

    setDeliveries(data ?? []);
    setLoading(false);
  }

  // Live PCA lookup as moisture is typed
  async function handleMoistureChange(val) {
    setMoisture(val);
    setPreview(null);
    setError("");

    const mc = parseFloat(val);
    if (isNaN(mc) || val === "") return;

    if (mc > 20.2) {
      setPreview({ result: "Rejected", discountValue: null });
      return;
    }
    if (mc < 5.0) {
      setPreview({ result: "Accepted", discountValue: 0.0 });
      return;
    }

    // Round to nearest 0.1 for table lookup
    setLookingUp(true);
    const rounded = Math.round(mc * 10) / 10;
    const { data } = await supabase
      .from("pca_discount_table")
      .select("discount_value, discount_id")
      .eq("moisture_content_pct", rounded)
      .single();

    setLookingUp(false);

    if (data) {
      setPreview({ result: "Accepted", discountValue: data.discount_value, discountId: data.discount_id });
    } else {
      setPreview({ result: "Accepted", discountValue: 0.0 });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const mc = parseFloat(moisture);
    if (isNaN(mc) || mc < 0) { setError("Enter a valid moisture content cc."); return; }
    if (!preview) { setError("Moisture lookup not complete. Try again."); return; }

    setSubmitting(true);

    // 1. Create laboratory inspection record
    const { data: inspection, error: iErr } = await supabase
      .from("laboratory_inspections")
      .insert({
        delivery_id: selected.delivery_id,
        lab_staff_id: user.id,
        moisture_content_pct: mc,
      })
      .select("inspection_id")
      .single();

    if (iErr) { setError("Failed to save inspection."); setSubmitting(false); return; }

    // 2. Create quality result
    const { error: qErr } = await supabase.from("quality_results").insert({
      delivery_id: selected.delivery_id,
      inspection_id: inspection.inspection_id,
      result: preview.result,
      remarks: preview.result === "Rejected"
        ? `Moisture content ${mc}cc exceeds 20.2cc — automatic rejection.`
        : `Moisture content ${mc}cc. Discount: ${preview.discountValue ?? 0}%.`,
    });

    if (qErr) { setError("Inspection saved but quality result failed."); setSubmitting(false); return; }

    // 3. Update delivery status
    const newStatus = preview.result === "Accepted" ? "Accepted" : "Rejected";
    const { error: dErr } = await supabase.from("deliveries")
      .update({ delivery_status: newStatus, lab_staff_id: user.id })
      .eq("delivery_id", selected.delivery_id);

    if (dErr) { setError("Inspection saved but delivery status update failed. Please reload and try again."); setSubmitting(false); return; }

    // 4. For accepted contractual deliveries → add to Resecada inventory
    // (Walk-in batches are already inserted into Walk-in Holding by WalkinDeliveryForm at record time)
    if (preview.result === "Accepted" && selected.delivery_source === "Contract-based") {
      const netKg = selected.weighing_records?.[0]?.net_weight_kg ?? 0;
      await supabase.from("inventory_batches").insert({
        delivery_id: selected.delivery_id,
        source_type: "Contractual",
        batch_status: "Resecada",
        weight_kg: netKg,
        recorded_date: selected.delivery_date,
      });
    }

    // 5. Notify the supplier (contractual deliveries only — walk-in suppliers have no account)
    if (selected.delivery_source === "Contract-based") {
      const supplierId = selected.supplier?.user_id;
      // Collect contract numbers from allocations for the notification message
      const contractNums = (selected.delivery_allocations ?? [])
        .map(a => a.contract?.contract_number)
        .filter(Boolean)
        .join(", ");
      const contractRef = contractNums || selected.contract?.contract_number || "";
      const netKg = selected.weighing_records?.[0]?.net_weight_kg ?? 0;

      if (supplierId) {
        const notifType = preview.result === "Accepted" ? "Delivery Accepted" : "Delivery Rejected";
        const notifMsg = preview.result === "Accepted"
          ? `Your delivery${contractRef ? ` under ${contractRef}` : ""} (${Number(netKg).toFixed(2)} kg net) has been accepted. Moisture: ${mc}cc.`
          : `Your delivery${contractRef ? ` under ${contractRef}` : ""} has been rejected. Moisture content ${mc}cc exceeds 20.2cc.`;

        await supabase.from("notifications").insert({
          user_id: supplierId,
          notification_type: notifType,
          message: notifMsg,
          related_entity_type: "deliveries",
          related_entity_id: selected.delivery_id,
        });
      }
    }

    setSubmitting(false);
    setSuccess({
      result: preview.result,
      moisture: mc,
      discount: preview.discountValue,
      supplierName: getSupplierName(selected),
      netKg: selected.weighing_records?.[0]?.net_weight_kg,
    });
  }

  function getSupplierName(d) {
    return d.delivery_source === "Walkin"
      ? `${d.walkin_supplier?.first_name ?? ""} ${d.walkin_supplier?.last_name ?? ""}`.trim()
      : `${d.supplier?.first_name ?? ""} ${d.supplier?.last_name ?? ""}`.trim();
  }

  function resetInspection() {
    setSelected(null);
    setMoisture("");
    setPreview(null);
    setError("");
    setSuccess(null);
    fetchQueue();
  }

  // ── Success screen ───────────────────────────────────────────
  if (success) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
            success.result === "Accepted" ? "bg-green-pale" : "bg-red-50"
          }`}>
            {success.result === "Accepted"
              ? <LuCheck className="w-8 h-8 text-green-dark" />
              : <LuX className="w-8 h-8 text-red-500" />
            }
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-2">
            Delivery {success.result}
          </h2>
          <p className="text-brown-light text-sm mb-5">
            <span className="font-semibold text-brown-dark">{success.supplierName}</span> ·{" "}
            Moisture: <span className="font-semibold text-brown-dark">{success.moisture}cc</span>
          </p>

          {success.result === "Accepted" ? (
            <div className="bg-green-pale rounded-xl px-4 py-3 text-sm text-left mb-6 space-y-2">
              <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-1">Quality Summary</p>
              <p className="text-brown-mid">Net weight: <span className="font-semibold text-brown-dark">{Number(success.netKg).toFixed(2)} kg</span></p>
              <p className="text-brown-mid">Moisture discount: <span className="font-semibold text-brown-dark">{success.discount ?? 0}%</span></p>
              <p className="text-brown-mid">
                Moisture deduction:{" "}
                <span className="font-semibold text-brown-dark">
                  {(Number(success.netKg) * ((success.discount ?? 0) / 100)).toFixed(2)} kg
                </span>
              </p>
              <p className="text-brown-mid">
                Final weight:{" "}
                <span className="font-bold text-green-dark">
                  {(Number(success.netKg) * (1 - (success.discount ?? 0) / 100)).toFixed(2)} kg
                </span>
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
              Moisture content {success.moisture}cc exceeds 20.2cc. This delivery is automatically rejected — no payment will be processed.
            </div>
          )}

          <button onClick={resetInspection}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all">
            Back to Queue
          </button>
        </div>
      </div>
    );
  }

  // ── Inspection form ──────────────────────────────────────────
  if (selected) {
    const netKg = selected.weighing_records?.[0]?.net_weight_kg ?? 0;
    const mc = parseFloat(moisture);
    const deductionKg = preview?.result === "Accepted" && preview?.discountValue
      ? (netKg * (preview.discountValue / 100))
      : 0;
    const finalKg = netKg - deductionKg;

    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setSelected(null); setMoisture(""); setPreview(null); setError(""); }}
            className="text-brown-light hover:text-brown-dark transition-colors">
            <LuArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
            <LuFlaskConical className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-brown-dark">Quality Inspection</h1>
            <p className="text-brown-light text-sm">{getSupplierName(selected)}</p>
          </div>
        </div>

        {/* Delivery summary */}
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5 mb-5">
          <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-3">Delivery Info</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-brown-light text-xs">Supplier</p>
              <p className="font-semibold text-brown-dark">{getSupplierName(selected)}</p>
            </div>
            <div>
              <p className="text-brown-light text-xs">Type</p>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                selected.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
              }`}>
                {selected.delivery_source === "Walkin" ? <><LuTruck className="w-3 h-3" />Walk-in</> : <><LuFileText className="w-3 h-3" />Contractual</>}
              </span>
            </div>
            <div>
              <p className="text-brown-light text-xs">Net Weight</p>
              <p className="font-semibold text-brown-dark">{Number(netKg).toFixed(2)} kg</p>
            </div>
            <div>
              <p className="text-brown-light text-xs">Delivery Date</p>
              <p className="font-semibold text-brown-dark">
                {new Date(selected.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-4 text-sm">
            <LuCircleAlert className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Moisture input */}
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-5">
            <label className="block text-sm font-bold text-brown-dark mb-3 flex items-center gap-2">
              <LuDroplets className="w-4 h-4 text-blue-400" /> Moisture Content (cc)
            </label>
            <div className="relative">
              <input
                type="number" step="0.1" min="0" max="100" required
                value={moisture}
                onChange={e => handleMoistureChange(e.target.value)}
                placeholder="e.g. 12.5"
                className="w-full px-4 py-3 rounded-xl border border-beige-dark bg-white text-brown-dark text-lg font-bold
                  placeholder-brown-light/40 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
              />
              {lookingUp && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <p className="text-xs text-brown-light mt-2">
              Above 20.2cc → Automatic Rejection
            </p>
          </div>

          {/* Live result preview */}
          {preview && (
            <div className={`rounded-2xl border-2 p-5 transition-all duration-300 ${
              preview.result === "Accepted"
                ? "bg-green-pale border-green-mid/30"
                : "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {preview.result === "Accepted"
                  ? <LuCheck className="w-5 h-5 text-green-dark" />
                  : <LuX className="w-5 h-5 text-red-500" />
                }
                <p className={`font-bold text-base ${preview.result === "Accepted" ? "text-green-dark" : "text-red-600"}`}>
                  {preview.result === "Accepted" ? "Accepted" : "Rejected — Automatic"}
                </p>
              </div>

              {preview.result === "Accepted" ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">PCA Discount</p>
                    <p className="font-bold text-brown-dark">{preview.discountValue ?? 0}%</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Moisture Deduction</p>
                    <p className="font-bold text-brown-dark">{deductionKg.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Net Weight</p>
                    <p className="text-brown-mid">{Number(netKg).toFixed(2)} kg</p>
                  </div>
                  <div>
                    <p className="text-brown-light text-xs mb-0.5">Final Weight</p>
                    <p className="font-bold text-green-dark text-base">{finalKg.toFixed(2)} kg</p>
                  </div>
                </div>
              ) : (
                <p className="text-red-600 text-sm">
                  Moisture {mc}cc exceeds the 20.2cc maximum. No payment will be processed for this delivery.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { setSelected(null); setMoisture(""); setPreview(null); setError(""); }}
              className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !preview || lookingUp}
              className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60
                ${preview?.result === "Rejected"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-gradient-to-r from-green-dark to-green-mid hover:shadow-glow-green"
                }`}>
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              ) : preview?.result === "Rejected" ? "Confirm Rejection" : "Confirm Acceptance"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Queue list ───────────────────────────────────────────────
  return (
    <div className="pt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
          <LuFlaskConical className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Inspection Queue</h1>
          <p className="text-brown-light text-sm">Deliveries awaiting quality inspection</p>
        </div>
        {!loading && deliveries.length > 0 && (
          <span className="ml-auto text-xs bg-amber-50 text-amber-700 font-semibold px-3 py-1.5 rounded-full border border-amber-200">
            {deliveries.length} pending
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuFlaskConical className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">Queue is empty</p>
            <p className="text-brown-light text-sm mt-1">No deliveries awaiting inspection right now.</p>
          </div>
        ) : (
          <ul className="divide-y divide-beige-dark/20">
            {deliveries.map(d => {
              const supplierName = getSupplierName(d);
              const netKg = d.weighing_records?.[0]?.net_weight_kg;
              return (
                <li key={d.delivery_id}>
                  <button
                    onClick={() => { setSelected(d); setMoisture(""); setPreview(null); setError(""); }}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-beige/40 transition-colors text-left"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      d.delivery_source === "Walkin" ? "bg-orange-50" : "bg-green-pale"
                    }`}>
                      {d.delivery_source === "Walkin"
                        ? <LuTruck className="w-5 h-5 text-orange-500" />
                        : <LuFileText className="w-5 h-5 text-green-dark" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-brown-dark text-sm">{supplierName || "—"}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          d.delivery_source === "Walkin" ? "bg-orange-50 text-orange-600" : "bg-green-pale text-green-dark"
                        }`}>
                          {d.delivery_source === "Walkin" ? "Walk-in" : "Contractual"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-brown-light text-xs">
                          {new Date(d.delivery_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        {netKg && (
                          <p className="text-brown-light text-xs">· {Number(netKg).toFixed(2)} kg net</p>
                        )}
                        {d.contract?.contract_number && (
                          <p className="text-brown-light text-xs">· {d.contract.contract_number}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-purple-400 shrink-0">
                      <LuFlaskConical className="w-5 h-5" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}