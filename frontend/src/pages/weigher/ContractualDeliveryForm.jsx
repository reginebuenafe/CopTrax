import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuFileText, LuArrowLeft, LuScale, LuCircleAlert,
  LuCheck, LuCalendar, LuTruck, LuChevronDown,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function ContractualDeliveryForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [contracts, setContracts] = useState([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [selectedContract, setSelectedContract] = useState(null);

  const [form, setForm] = useState({
    deliveryDate: new Date().toISOString().split("T")[0],
    truckPlate: "",
    grossWeight: "",
    tareWeight: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchActiveContracts();
  }, []);

  async function fetchActiveContracts() {
    setLoadingContracts(true);
    const { data } = await supabase
      .from("contracts")
      .select(`
        contract_id, contract_number, contracted_tons, negotiated_price_per_kg,
        due_date, status,
        supplier:supplier_id(first_name, last_name)
      `)
      .eq("status", "Active")
      .order("due_date", { ascending: true });
    setContracts(data ?? []);
    setLoadingContracts(false);
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function handleContractSelect(e) {
    const id = e.target.value;
    setSelectedContractId(id);
    setSelectedContract(contracts.find(c => c.contract_id === id) ?? null);
  }

  const gross = parseFloat(form.grossWeight) || 0;
  const tare = parseFloat(form.tareWeight) || 0;
  const net = gross > tare ? gross - tare : 0;

  const isLate = selectedContract && form.deliveryDate > selectedContract.due_date;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!selectedContractId) { setError("Please select a contract."); return; }
    if (gross <= 0) { setError("Enter a valid gross weight."); return; }
    if (tare < 0) { setError("Tare weight cannot be negative."); return; }
    if (tare >= gross) { setError("Tare weight must be less than gross weight."); return; }

    setSubmitting(true);

    // 1. Create delivery
    const { data: delivery, error: dErr } = await supabase
      .from("deliveries")
      .insert({
        delivery_source: "Contract-based",
        contract_id: selectedContractId,
        delivery_date: form.deliveryDate,
        truck_plate_number: form.truckPlate.trim() || null,
        weigher_id: user.id,
        delivery_status: "Weighed",
      })
      .select("delivery_id")
      .single();

    if (dErr) {
      setError("Failed to create delivery record.");
      setSubmitting(false);
      return;
    }

    // 2. Create weighing record
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

    setSubmitting(false);
    setSuccess({
      contractNumber: selectedContract.contract_number,
      supplierName: `${selectedContract.supplier?.first_name} ${selectedContract.supplier?.last_name}`,
      netWeight: net,
      isLate,
    });
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${success.isLate ? "bg-amber-50" : "bg-green-pale"}`}>
            <LuCheck className={`w-8 h-8 ${success.isLate ? "text-amber-500" : "text-green-dark"}`} />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-2">Contractual Delivery Recorded</h2>
          {success.isLate && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 mb-4 text-sm">
              <LuCircleAlert className="w-4 h-4 shrink-0" />
              Late delivery — this will use the spot price and breach the contract when payment is processed.
            </div>
          )}
          <p className="text-brown-light text-sm mb-5">
            <span className="font-semibold text-brown-dark">{success.supplierName}</span> · Contract{" "}
            <span className="font-semibold text-brown-dark">{success.contractNumber}</span>
            <br />
            <span className="font-semibold text-green-dark">{success.netWeight.toFixed(3)} kg</span> net weight. Awaiting lab inspection.
          </p>
          <div className="bg-beige rounded-xl px-4 py-3 text-left mb-6 text-sm space-y-1">
            <p className="text-brown-light text-xs font-semibold uppercase tracking-wide mb-2">Summary</p>
            <p className="text-brown-mid">Gross: <span className="font-semibold text-brown-dark">{gross.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Tare: <span className="font-semibold text-brown-dark">{tare.toFixed(3)} kg</span></p>
            <p className="text-brown-mid">Net: <span className="font-bold text-green-dark">{success.netWeight.toFixed(3)} kg</span></p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setSuccess(null); setSelectedContractId(""); setSelectedContract(null); setForm({ deliveryDate: new Date().toISOString().split("T")[0], truckPlate: "", grossWeight: "", tareWeight: "" }); }}
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
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/dashboard/weigher")} className="text-brown-light hover:text-brown-dark transition-colors">
          <LuArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuFileText className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Contractual Delivery</h1>
          <p className="text-brown-light text-sm">Link delivery to an active contract</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
          <LuCircleAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Contract selection */}
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
          <h3 className="text-sm font-bold text-brown-dark mb-4 flex items-center gap-2">
            <LuFileText className="w-4 h-4 text-brown-light" /> Select Contract
          </h3>

          {loadingContracts ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
            </div>
          ) : contracts.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <LuCircleAlert className="w-4 h-4 shrink-0" />
              No active contracts found. Ask the Business Owner to activate a contract first.
            </div>
          ) : (
            <>
              <div className="relative mb-4">
                <LuChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
                <select required value={selectedContractId} onChange={handleContractSelect}
                  className={`${inputClass} pr-10 appearance-none`}>
                  <option value="">Select a contract…</option>
                  {contracts.map(c => (
                    <option key={c.contract_id} value={c.contract_id}>
                      {c.contract_number} — {c.supplier?.first_name} {c.supplier?.last_name} (Due: {new Date(c.due_date).toLocaleDateString("en-PH")})
                    </option>
                  ))}
                </select>
              </div>

              {/* Contract info card */}
              {selectedContract && (
                <div className="bg-green-pale rounded-xl px-4 py-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-brown-light mb-0.5">Supplier</p>
                    <p className="font-semibold text-brown-dark">{selectedContract.supplier?.first_name} {selectedContract.supplier?.last_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brown-light mb-0.5">Contract No.</p>
                    <p className="font-semibold text-brown-dark">{selectedContract.contract_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brown-light mb-0.5">Price / kg</p>
                    <p className="font-semibold text-green-dark">₱{Number(selectedContract.negotiated_price_per_kg).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brown-light mb-0.5">Due Date</p>
                    <p className={`font-semibold ${isLate ? "text-red-600" : "text-brown-dark"}`}>
                      {new Date(selectedContract.due_date).toLocaleDateString("en-PH")}
                      {isLate && " ⚠ Late"}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
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
              {isLate && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <LuCircleAlert className="w-3 h-3" /> Past due — spot price will apply, contract will be breached.
                </p>
              )}
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
              Net = {gross.toFixed(3)} − {tare.toFixed(3)} = <span className="font-semibold text-green-dark">{net.toFixed(3)} kg</span>
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate("/dashboard/weigher")}
            className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
            Cancel
          </button>
          <button type="submit" disabled={submitting || contracts.length === 0}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm
              hover:shadow-glow-green transition-all disabled:opacity-60">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </span>
            ) : "Save Contractual Delivery"}
          </button>
        </div>
      </form>
    </div>
  );
}
