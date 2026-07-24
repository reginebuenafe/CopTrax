import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuTruck, LuArrowLeft, LuUser, LuMapPin, LuPhone,
  LuCalendar, LuScale, LuCircleAlert, LuCheck,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function WalkinDeliveryForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    address: "",
    phone: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    truckPlate: "",
    grossWeight: "",
    tareWeight: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  const gross = parseFloat(form.grossWeight) || 0;
  const tare = parseFloat(form.tareWeight) || 0;
  const net = gross > tare ? gross - tare : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (gross <= 0) { setError("Enter a valid gross weight."); return; }
    if (tare < 0) { setError("Tare weight cannot be negative."); return; }
    if (tare >= gross) { setError("Tare weight must be less than gross weight."); return; }

    setSubmitting(true);

    // 1. Create or find walk-in supplier
    const { data: walkinSupplier, error: wsErr } = await supabase
      .from("walkin_suppliers")
      .insert({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
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
        truck_plate_number: form.truckPlate.trim() || null,
        weigher_id: user.id,
        delivery_status: "Weighed",
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
      gross_weight_kg: gross,
      tare_weight_kg: tare,
      net_weight_kg: net,
    });

    if (wrErr) {
      setError("Delivery saved but weighing record failed.");
      setSubmitting(false);
      return;
    }

    // 4. Create inventory batch (Walk-in Holding)
    await supabase.from("inventory_batches").insert({
      delivery_id: delivery.delivery_id,
      source_type: "Walkin",
      batch_status: "Walk-in Holding",
      weight_kg: net,
      recorded_date: form.deliveryDate,
    });

    setSubmitting(false);
    setSuccess({
      supplierName: `${form.firstName} ${form.lastName}`,
      netWeight: net,
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
            <span className="font-semibold text-green-dark">{success.netWeight.toFixed(3)} kg</span> net weight.
            Delivery is now awaiting lab inspection.
          </p>
          <div className="bg-beige rounded-xl px-4 py-3 text-left mb-6 text-sm space-y-1">
            <p className="text-brown-light text-xs font-semibold uppercase tracking-wide mb-2">Summary</p>
            <p className="text-brown-mid">Gross: <span className="font-semibold text-brown-dark">{gross.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Tare: <span className="font-semibold text-brown-dark">{tare.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Net: <span className="font-bold text-green-dark">{success.netWeight.toFixed(3)} kg</span></p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setSuccess(null); setForm({ firstName:"",lastName:"",address:"",phone:"",deliveryDate:new Date().toISOString().split("T")[0],truckPlate:"",grossWeight:"",tareWeight:"" }); }}
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
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">First Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.firstName} onChange={set("firstName")} placeholder="Juan" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Last Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.lastName} onChange={set("lastName")} placeholder="dela Cruz" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">
                <LuPhone className="inline w-3 h-3 mr-1" /> Phone
              </label>
              <input type="tel" value={form.phone} onChange={set("phone")} placeholder="+63 9XX XXX XXXX" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">
                <LuMapPin className="inline w-3 h-3 mr-1" /> Address
              </label>
              <input type="text" value={form.address} onChange={set("address")} placeholder="Barangay, Municipality" className={inputClass} />
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
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Truck Plate Number</label>
              <input type="text" value={form.truckPlate} onChange={set("truckPlate")} placeholder="ABC 1234" className={inputClass} />
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
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Gross Weight (kg) <span className="text-red-500">*</span></label>
              <input type="number" step="0.001" min="0.001" required value={form.grossWeight} onChange={set("grossWeight")} placeholder="0.000" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Tare Weight (kg) <span className="text-red-500">*</span></label>
              <input type="number" step="0.001" min="0" required value={form.tareWeight} onChange={set("tareWeight")} placeholder="0.000" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-brown-dark mb-1.5">Net Weight (kg)</label>
              <div className={`${inputClass} bg-green-pale border-green-mid/30 font-bold text-green-dark`}>
                {net > 0 ? net.toFixed(3) : "—"}
              </div>
            </div>
          </div>
          {net > 0 && (
            <p className="text-xs text-brown-light mt-2">
              Net = Gross − Tare = {gross.toFixed(3)} − {tare.toFixed(3)} = <span className="font-semibold text-green-dark">{net.toFixed(3)} kg</span>
            </p>
          )}
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
