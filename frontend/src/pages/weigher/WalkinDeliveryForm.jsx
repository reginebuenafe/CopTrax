import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuTruck, LuArrowLeft, LuUser,
  LuCalendar, LuScale, LuCircleAlert, LuCheck,
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
    condition: "Dry",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [spotPrice, setSpotPrice] = useState(null);

  useEffect(() => {
    async function fetchSpotPrice() {
      const { data, error: spotError } = await supabase
        .from("spot_price")
        .select("price_per_kg")
        .limit(1)
        .single();
      if (!spotError) setSpotPrice(Number(data.price_per_kg));
    }
    fetchSpotPrice();
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  const weight = parseFloat(form.weight) || 0;
  const deduction = form.condition === "Wet" ? weight * 0.10 : 0;
  const finalWeight = Math.max(weight - deduction, 0);
  const paymentAmount = spotPrice !== null ? finalWeight * spotPrice : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.supplierName.trim()) { setError("Enter the supplier name."); return; }
    if (weight <= 0) { setError("Enter a valid weight."); return; }

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

    // 1. Create or find walk-in supplier
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

    // 2. Create delivery
    const { data: delivery, error: dErr } = await supabase
      .from("deliveries")
      .insert({
        delivery_source: "Walkin",
        walkin_supplier_id: walkinSupplier.walkin_supplier_id,
        delivery_date: form.deliveryDate,
        weigher_id: user.id,
        delivery_status: "Accepted",
      })
      .select("delivery_id, batch_number")
      .single();

    if (dErr) {
      setError("Failed to create delivery record.");
      setSubmitting(false);
      return;
    }

    // 3. Create weighing record
    const { error: wrErr } = await supabase.from("weighing_records").insert({
      delivery_id: delivery.delivery_id,
      weigher_id: user.id,
      gross_weight_kg: weight,
      tare_weight_kg: deduction,
      net_weight_kg: finalWeight,
    });

    if (wrErr) {
      setError(`Delivery saved but weighing record failed: ${wrErr.message}`);
      setSubmitting(false);
      return;
    }

    // 4. Create inventory batch (Walk-in Holding)
    await supabase.from("inventory_batches").insert({
      delivery_id: delivery.delivery_id,
      source_type: "Walkin",
      batch_status: "Walk-in Holding",
      weight_kg: finalWeight,
      recorded_date: form.deliveryDate,
    });

    setSubmitting(false);
    setSuccess({
      supplierName: form.supplierName.trim(),
      weight,
      condition: form.condition,
      deduction,
      finalWeight,
      paymentAmount: finalWeight * currentSpotPrice,
      deliveryId: delivery.delivery_id,
    });
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-center">
          <div className="w-16 h-16 bg-green-pale rounded-2xl flex items-center justify-center mx-auto mb-5">
            <LuCheck className="w-8 h-8 text-green-dark" />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-2">Walk-in Delivery Recorded</h2>
          <p className="text-brown-light text-sm mb-5">
            <span className="font-semibold text-brown-dark">{success.supplierName}</span> —{" "}
            <span className="font-semibold text-green-dark">{success.finalWeight.toFixed(3)} kg</span> final weight.
            Delivery accepted and added to inventory — no lab inspection required for Walk-in.
          </p>
          <div className="bg-beige rounded-xl px-4 py-3 text-left mb-6 text-sm space-y-1">
            <p className="text-brown-light text-xs font-semibold uppercase tracking-wide mb-2">Summary</p>
            <p className="text-brown-mid">Weight: <span className="font-semibold text-brown-dark">{success.weight.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Condition: <span className="font-semibold text-brown-dark">{success.condition}</span></p>
            <p className="text-brown-mid">Deduction: <span className="font-semibold text-brown-dark">{success.deduction.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Final weight: <span className="font-bold text-green-dark">{success.finalWeight.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Payment amount: <span className="font-bold text-green-dark">₱{success.paymentAmount.toFixed(2)}</span></p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setSuccess(null); setForm({ supplierName:"",deliveryDate:new Date().toISOString().split("T")[0],weight:"",condition:"Dry" }); }}
              className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              Record Another
            </button>
            <button onClick={() => navigate("/dashboard/weigher/history")}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm hover:shadow-glow-green transition-all">
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
        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
          <LuTruck className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Walk-in Delivery</h1>
          <p className="text-brown-light text-sm">Record a cash delivery with no contract</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
          <LuCircleAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Supplier details */}
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
          <h3 className="text-sm font-bold text-brown-dark mb-4 flex items-center gap-2">
            <LuUser className="w-4 h-4 text-brown-light" /> Supplier Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Supplier Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.supplierName} onChange={set("supplierName")} placeholder="Juan dela Cruz" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Delivery details */}
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
          <h3 className="text-sm font-bold text-brown-dark mb-4 flex items-center gap-2">
            <LuTruck className="w-4 h-4 text-brown-light" /> Delivery Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">
                <LuCalendar className="inline w-3 h-3 mr-1" /> Delivery Date <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.deliveryDate} onChange={set("deliveryDate")} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Weighing */}
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
          <h3 className="text-sm font-bold text-brown-dark mb-4 flex items-center gap-2">
            <LuScale className="w-4 h-4 text-brown-light" /> Weighing Record
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Weight (kg) <span className="text-red-500">*</span></label>
              <input type="number" step="0.001" min="0.001" required value={form.weight} onChange={set("weight")} placeholder="0.000" className={inputClass} />
            </div>
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
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Final Weight (kg)</label>
              <div className={`${inputClass} bg-green-pale border-green-mid/30 font-bold text-green-dark`}>
                {finalWeight > 0 ? finalWeight.toFixed(3) : "—"}
              </div>
            </div>
          </div>
          {finalWeight > 0 && (
            <p className="text-xs text-brown-light mt-2">
              {form.condition === "Wet" ? `Deduction = ${weight.toFixed(3)} × 10% = ${deduction.toFixed(3)} kg · ` : "No deduction · "}
              Final weight = <span className="font-semibold text-green-dark">{finalWeight.toFixed(3)} kg</span>
            </p>
          )}
          <div className="mt-4 rounded-xl bg-beige px-4 py-3 text-sm flex items-center justify-between">
            <span className="text-brown-mid">Payment amount{spotPrice !== null ? ` at ₱${spotPrice.toFixed(2)}/kg` : ""}</span>
            <span className="font-bold text-green-dark">{paymentAmount !== null ? `₱${paymentAmount.toFixed(2)}` : "—"}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate("/dashboard/weigher")}
            className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm
              hover:shadow-glow-green transition-all disabled:opacity-60">
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