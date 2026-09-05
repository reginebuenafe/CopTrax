import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuTruck, LuArrowLeft, LuUser,
  LuCalendar, LuScale, LuCircleAlert, LuCheck, LuPackage,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function WalkinDeliveryForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    supplierName: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    weight: "",
    numSacks: "",
    condition: "Dry",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [spotPrice, setSpotPrice] = useState(null);

  useEffect(() => {
    async function fetchSpotPrice() {
      const { data } = await supabase
        .from("spot_price")
        .select("price_per_kg")
        .limit(1)
        .maybeSingle();
      if (data?.price_per_kg != null) setSpotPrice(Number(data.price_per_kg));
    }
    fetchSpotPrice();
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  // ── Weight computation ─────────────────────────────────────────────────────
  // Entered weight IS the Gross Weight
  const grossWeight    = parseFloat(form.weight) || 0;
  const numSacks       = parseInt(form.numSacks, 10) || 0;
  const sacksDeduction = numSacks / 2;                                          // sacks ÷ 2 = bag weight
  const netWeight      = Math.max(grossWeight - sacksDeduction, 0);             // net after removing bags
  const wetDeduction   = form.condition === "Wet" ? grossWeight * 0.10 : 0;    // 10% of GROSS weight
  const finalWeight    = Math.max(netWeight - wetDeduction, 0);                 // final payable weight

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.supplierName.trim()) { setError("Enter the supplier name."); return; }
    if (grossWeight <= 0)          { setError("Enter a valid weight."); return; }
    if (numSacks <= 0)             { setError("Enter the number of sacks."); return; }

    setSubmitting(true);

    const { data: currentSpot, error: spotError } = await supabase
      .from("spot_price")
      .select("price_per_kg")
      .limit(1)
      .single();
    if (spotError || !currentSpot) {
      setError("Current spot price is unavailable. Try again.");
      setSubmitting(false);
      return;
    }
    const currentSpotPrice = Number(currentSpot.price_per_kg);
    setSpotPrice(currentSpotPrice);

    // 1. Create walk-in supplier
    const { data: walkinSupplier, error: wsErr } = await supabase
      .from("walkin_suppliers")
      .insert({
        first_name: form.supplierName.trim().split(/\s+/)[0],
        last_name: form.supplierName.trim().split(/\s+/).slice(1).join(" ") || "-",
        recorded_by: user.id,
      })
      .select("walkin_supplier_id")
      .single();

    if (wsErr) {
      setError("Failed to save supplier details.");
      setSubmitting(false);
      return;
    }

    const computedAmount = Math.round(finalWeight * currentSpotPrice * 100) / 100;

    // 2. Create delivery — lock in spot price at submission time
    const { data: delivery, error: dErr } = await supabase
      .from("deliveries")
      .insert({
        delivery_source:      "Walkin",
        walkin_supplier_id:   walkinSupplier.walkin_supplier_id,
        delivery_date:        form.deliveryDate,
        weigher_id:           user.id,
        delivery_status:      "Accepted",
        walkin_spot_price_kg: currentSpotPrice,
        walkin_amount_paid:   computedAmount,
      })
      .select("delivery_id, batch_number")
      .single();

    if (dErr) {
      setError("Failed to create delivery record.");
      setSubmitting(false);
      return;
    }

    // 3. Create weighing record — gross = entered weight, tare = sacks deduction, net = final payable
    const { error: wrErr } = await supabase.from("weighing_records").insert({
      delivery_id:     delivery.delivery_id,
      weigher_id:      user.id,
      gross_weight_kg: grossWeight,
      tare_weight_kg:  sacksDeduction,
      net_weight_kg:   finalWeight,
      copra_condition: form.condition,
      num_sacks:       numSacks,
    });

    if (wrErr) {
      setError(`Delivery saved but weighing record failed: ${wrErr.message}`);
      setSubmitting(false);
      return;
    }

    // 4. Create inventory batch (Walk-in Holding)
    const { error: ibErr } = await supabase.from("inventory_batches").insert({
      delivery_id:   delivery.delivery_id,
      source_type:   "Walkin",
      batch_status:  "Walk-in Holding",
      weight_kg:     finalWeight,
      recorded_date: form.deliveryDate,
    });

    if (ibErr) {
      setError(`Delivery recorded but inventory batch failed: ${ibErr.message}. Please contact support.`);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSuccess({
      supplierName:    form.supplierName.trim(),
      grossWeight,
      numSacks,
      sacksDeduction,
      netWeight,
      condition:       form.condition,
      wetDeduction,
      finalWeight,
      deliveryId:      delivery.delivery_id,
    });
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white border border-beige-dark/40 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-pale rounded-2xl flex items-center justify-center mx-auto mb-5">
            <LuCheck className="w-8 h-8 text-green-dark" />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-2">Walk-in Delivery Recorded</h2>
          <p className="text-brown-light text-sm mb-5">
            <span className="font-semibold text-brown-dark">{success.supplierName}</span>:{" "}
            <span className="font-semibold text-green-dark">{success.finalWeight.toFixed(2)} kg</span> final weight.
            Delivery accepted and added to inventory. No lab inspection required for Walk-in.
          </p>
          <div className="bg-beige rounded-xl px-4 py-3 text-left mb-6 text-sm space-y-1">
            <p className="text-brown-light text-xs font-semibold uppercase tracking-wide mb-2">Summary</p>
            <p className="text-brown-mid">Gross weight: <span className="font-semibold text-brown-dark">{success.grossWeight.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">No. of sacks: <span className="font-semibold text-brown-dark">{success.numSacks}</span></p>
            <p className="text-brown-mid">Sacks deduction: <span className="font-semibold text-red-600">−{success.sacksDeduction.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">Net weight: <span className="font-semibold text-brown-dark">{success.netWeight.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">Condition: <span className="font-semibold text-brown-dark">{success.condition}</span></p>
            {success.condition === "Wet" && (
              <p className="text-brown-mid">Wet deduction: <span className="font-semibold text-red-600">−{success.wetDeduction.toFixed(2)} kg</span></p>
            )}
            <div className="border-t border-beige-dark mt-2 pt-2">
              <p className="text-brown-mid font-semibold">Final weight: <span className="font-bold text-green-dark">{success.finalWeight.toFixed(2)} kg</span></p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setSuccess(null); setForm({ supplierName: "", deliveryDate: new Date().toISOString().split("T")[0], weight: "", numSacks: "", condition: "Dry" }); }}
              className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Record Another
            </button>
            <button onClick={() => navigate("/dashboard/weigher/history")}
              className="flex-1 py-2.5 rounded-xl bg-green-dark text-white font-semibold text-sm hover:bg-green-dark/90 transition-all">
              View History
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = `w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm
    placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all`;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/dashboard/weigher")} className="text-brown-light hover:text-brown-dark transition-colors">
          <LuArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Walk-in Delivery</h1>
          <p className="text-brown-light text-sm mt-0.5">Record a cash delivery with no contract</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
          <LuCircleAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Supplier details */}
        <div className="bg-white border border-beige-dark/40 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-brown-dark mb-4 flex items-center gap-2">
            <LuUser className="w-4 h-4 text-brown-light" /> Supplier Information
          </h3>
          <div>
            <label className="block text-xs font-medium text-brown-dark mb-1.5">Supplier Name <span className="text-red-500">*</span></label>
            <input type="text" required value={form.supplierName} onChange={set("supplierName")} placeholder="Juan dela Cruz" className={inputClass} />
          </div>
        </div>

        {/* Delivery details */}
        <div className="bg-white border border-beige-dark/40 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-brown-dark mb-4 flex items-center gap-2">
            <LuTruck className="w-4 h-4 text-brown-light" /> Delivery Details
          </h3>
          <div>
            <label className="block text-xs font-medium text-brown-dark mb-1.5">
              <LuCalendar className="inline w-3 h-3 mr-1" /> Delivery Date <span className="text-red-500">*</span>
            </label>
            <input type="date" required value={form.deliveryDate} onChange={set("deliveryDate")} className={inputClass} />
          </div>
        </div>

        {/* Weighing */}
        <div className="bg-white border border-beige-dark/40 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-brown-dark mb-4 flex items-center gap-2">
            <LuScale className="w-4 h-4 text-brown-light" /> Weighing Record
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Row 1: weight + sacks */}
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Gross Weight (kg) <span className="text-red-500">*</span></label>
              <input type="number" step="0.001" min="0.001" required value={form.weight} onChange={set("weight")} placeholder="0.000" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">
                <LuPackage className="inline w-3 h-3 mr-1" /> No. of Sacks <span className="text-red-500">*</span>
              </label>
              <input type="number" step="1" min="1" required value={form.numSacks} onChange={set("numSacks")} placeholder="0" className={inputClass} />
            </div>

            {/* Row 2: condition + computed breakdown */}
            <div>
              <span className="block text-xs font-medium text-brown-dark mb-1.5">Condition <span className="text-red-500">*</span></span>
              <div className="flex items-center gap-4 h-10">
                {['Dry', 'Wet'].map(condition => (
                  <label key={condition} className="flex items-center gap-2 text-sm text-brown-mid cursor-pointer">
                    <input type="radio" name="condition" value={condition} checked={form.condition === condition} onChange={set("condition")} className="accent-green-dark" />
                    {condition}
                  </label>
                ))}
              </div>
            </div>

            {/* Computed breakdown (read-only) */}
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-brown-dark mb-1.5">Net Weight (kg)</label>
                <div className={`${inputClass} bg-beige border-beige-dark text-brown-dark font-semibold`}>
                  {netWeight > 0 ? netWeight.toFixed(2) : "—"}
                </div>
              </div>
            </div>

            {/* Final weight — full width */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Final Weight (kg)</label>
              <div className={`${inputClass} bg-green-pale border-green-mid/30 font-bold text-green-dark`}>
                {finalWeight > 0 ? finalWeight.toFixed(2) : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate("/dashboard/weigher")}
            className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-green-dark text-white font-bold text-sm
              hover:bg-green-dark/90 transition-all disabled:opacity-60">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </span>
            ) : "Save Walk-in Delivery"}
          </button>
        </div>
      </form>
    </div>
  );
}