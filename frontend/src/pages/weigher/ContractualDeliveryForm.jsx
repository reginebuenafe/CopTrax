import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuFileText, LuArrowLeft, LuScale, LuCircleAlert,
  LuCheck, LuCalendar, LuTruck, LuSearch, LuUser,
  LuCoins, LuPackage,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function peso(n) {
  return "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ContractualDeliveryForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Supplier search
  const [supplierQuery, setSupplierQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedContract, setSelectedContract] = useState(null);
  const searchRef = useRef(null);

  // Supplier's active contracts + spot price (loaded after supplier select)
  const [activeContracts, setActiveContracts] = useState([]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [loadingContracts, setLoadingContracts] = useState(false);

  // Form fields
  const [form, setForm] = useState({
    deliveryDate: new Date().toISOString().split("T")[0],
    truckPlate: "",
    grossWeight: "",
    tareWeight: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const gross = parseFloat(form.grossWeight) || 0;
  const tare  = parseFloat(form.tareWeight)  || 0;
  const net   = gross > tare ? gross - tare : 0;

  // ── Supplier search ────────────────────────────────────────────────────────
  const searchSuppliers = useCallback(async (q) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("users")
      .select("user_id, first_name, last_name, roles!inner(role_name)")
      .eq("account_status", "Active")
      .eq("roles.role_name", "Supplier")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(10);
    setSearchResults(data ?? []);
    setShowDropdown(true);
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchSuppliers(supplierQuery), 300);
    return () => clearTimeout(timer);
  }, [supplierQuery, searchSuppliers]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function selectSupplier(s) {
    setSelectedSupplier(s);
    setSelectedContract(null);
    setSupplierQuery(`${s.first_name} ${s.last_name}`);
    setShowDropdown(false);
    await fetchSupplierData(s.user_id);
  }

  // ── Allocation preview builder ────────────────────────────────────────────
  const buildAllocationPreview = useCallback((netKg, contracts, spot) => {
    const result = [];
    let remaining = netKg;
    let seq = 1;

    for (const c of contracts) {
      if (remaining <= 0.001) break;
      const available = c._remainingKg ?? 0;
      if (available <= 0.001) continue;

      const toAlloc = Math.min(available, remaining);
      result.push({
        contract_id: c.contract_id,
        contract_number: c.contract_number,
        allocated_weight_kg: toAlloc,
        price_type: "Negotiated",
        price_per_kg: parseFloat(c.negotiated_price_per_kg),
        due_date: c.due_date,
        sequence_order: seq++,
      });
      remaining -= toAlloc;
    }

    if (remaining > 0.001) {
      result.push({
        contract_id: null,
        contract_number: null,
        allocated_weight_kg: remaining,
        price_type: "Spot",
        price_per_kg: spot ?? 0,
        due_date: null,
        sequence_order: seq,
      });
    }

    return result;
  }, []);

  // ── Load supplier's active contracts + spot price ─────────────────────────
  async function fetchSupplierData(supplierId) {
    setLoadingContracts(true);

    const [contractsRes, spotRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("contract_id, contract_number, contracted_tons, negotiated_price_per_kg, due_date")
        .eq("supplier_id", supplierId)
        .eq("status", "Active")
        .order("due_date", { ascending: true }),
      supabase.from("spot_price").select("price_per_kg").limit(1).single(),
    ]);

    // Log any errors for debugging
    if (contractsRes.error) {
      console.error("Error fetching contracts:", contractsRes.error);
    }
    if (spotRes.error) {
      console.error("Error fetching spot price:", spotRes.error);
    }

    const contracts = contractsRes.data ?? [];
    const spot = spotRes.data?.price_per_kg ?? 0;

    // Fetch already-allocated weight for each active contract
    if (contracts.length > 0) {
      const contractIds = contracts.map(c => c.contract_id);
      const { data: existingAllocs } = await supabase
        .from("delivery_allocations")
        .select("contract_id, allocated_weight_kg, delivery:delivery_id(delivery_status)")
        .in("contract_id", contractIds);

      // Compute remaining capacity for each contract
      const allocsByContract = (existingAllocs ?? []).reduce((acc, a) => {
        if (a.delivery?.delivery_status === "Rejected") return acc;
        acc[a.contract_id] = (acc[a.contract_id] ?? 0) + parseFloat(a.allocated_weight_kg);
        return acc;
      }, {});

      contracts.forEach(c => {
        c._contractedKg  = parseFloat(c.contracted_tons) * 1000;
        c._allocatedKg   = allocsByContract[c.contract_id] ?? 0;
        c._remainingKg   = Math.max(0, c._contractedKg - c._allocatedKg);
      });
    }

    const autoSelected = contracts[0] ?? null;
    setActiveContracts(contracts);
    setSelectedContract(autoSelected);
    setSpotPrice(parseFloat(spot));
    setLoadingContracts(false);
  }

  const allocationPreview = useMemo(() => {
    if (!selectedSupplier || net <= 0) return [];
    return buildAllocationPreview(net, activeContracts, spotPrice);
  }, [selectedSupplier, net, activeContracts, spotPrice, buildAllocationPreview]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!selectedSupplier) { setError("Search and select a supplier."); return; }
    if (!selectedContract) { setError("No active contract is available for this supplier."); return; }
    if (gross <= 0)         { setError("Enter a valid gross weight."); return; }
    if (tare < 0)           { setError("Tare weight cannot be negative."); return; }
    if (tare >= gross)      { setError("Tare weight must be less than gross weight."); return; }
    if (allocationPreview.length === 0) { setError("Could not compute allocation. Check weights."); return; }

    setSubmitting(true);

    const primaryContractId = selectedContract.contract_id;

    // 1. Create delivery
    const { data: delivery, error: dErr } = await supabase
      .from("deliveries")
      .insert({
        delivery_source: "Contract-based",
        contract_id:     primaryContractId,
        supplier_id:     selectedSupplier.user_id,
        delivery_date:   form.deliveryDate,
        truck_plate_number: form.truckPlate.trim() || null,
        weigher_id:      user.id,
        delivery_status: "Weighed",
      })
      .select("delivery_id")
      .single();

    if (dErr) { setError("Failed to create delivery record."); setSubmitting(false); return; }

    // 2. Create weighing record
    const { error: wrErr } = await supabase.from("weighing_records").insert({
      delivery_id:     delivery.delivery_id,
      weigher_id:      user.id,
      gross_weight_kg: gross,
      tare_weight_kg:  tare,
      net_weight_kg:   net,
    });

    if (wrErr) { setError("Delivery saved but weighing record failed."); setSubmitting(false); return; }

    // 3. Create delivery_allocations (cascade result)
    const allocRows = allocationPreview.map(a => ({
      delivery_id:         delivery.delivery_id,
      contract_id:         a.contract_id,
      allocated_weight_kg: a.allocated_weight_kg,
      price_type:          a.price_type,
      sequence_order:      a.sequence_order,
    }));

    const { error: aErr } = await supabase.from("delivery_allocations").insert(allocRows);
    if (aErr) { setError("Delivery recorded but allocation details failed."); setSubmitting(false); return; }

    setSubmitting(false);
    setSuccess({
      supplierName: `${selectedSupplier.first_name} ${selectedSupplier.last_name}`,
      netWeight: net,
      allocations: allocationPreview,
    });
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetForm() {
    setSuccess(null);
    setSelectedSupplier(null);
    setSelectedContract(null);
    setSupplierQuery("");
    setActiveContracts([]);
    setForm({ deliveryDate: new Date().toISOString().split("T")[0], truckPlate: "", grossWeight: "", tareWeight: "" });
    setError("");
  }

  const inputClass = `w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm
    placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all`;

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    const hasSpot = success.allocations.some(a => !a.contract_id);
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-green-pale">
            <LuCheck className="w-8 h-8 text-green-dark" />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-2">Contractual Delivery Recorded</h2>
          <p className="text-brown-light text-sm mb-5">
            <span className="font-semibold text-brown-dark">{success.supplierName}</span>
            <br />
            <span className="font-semibold text-green-dark">{success.netWeight.toFixed(3)} kg</span> net weight · Awaiting lab inspection
          </p>

          {/* Allocation breakdown */}
          <div className="bg-beige rounded-xl px-4 py-3 text-left mb-6">
            <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-3">Allocation</p>
            <div className="space-y-2">
              {success.allocations.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    {a.contract_id
                      ? <span className="font-semibold text-brown-dark">{a.contract_number}</span>
                      : <span className="font-semibold text-amber-700">Spot Price</span>
                    }
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      a.price_type === "Spot"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-green-pale text-green-dark"
                    }`}>{a.price_type}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-brown-dark">{a.allocated_weight_kg.toFixed(3)} kg</p>
                    <p className="text-xs text-brown-light">{peso(a.price_per_kg)}/kg</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasSpot && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
              <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Part of this delivery exceeded available contract capacity and will be priced at the current <strong>spot price</strong>.</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={resetForm}
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

  // ── Form ───────────────────────────────────────────────────────────────────
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
          <p className="text-brown-light text-sm">System auto-allocates to the supplier's active contracts</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
          <LuCircleAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Supplier search */}
        <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
          <h3 className="text-sm font-bold text-brown-dark mb-4 flex items-center gap-2">
            <LuUser className="w-4 h-4 text-brown-light" /> Search Supplier
          </h3>
          <div className="relative" ref={searchRef}>
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
            <input
              type="text"
              value={supplierQuery}
              onChange={e => {
                setSupplierQuery(e.target.value);
                if (selectedSupplier && e.target.value !== `${selectedSupplier.first_name} ${selectedSupplier.last_name}`) {
                  setSelectedSupplier(null);
                  setSelectedContract(null);
                  setActiveContracts([]);
                }
              }}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
              placeholder="Type supplier name…"
              className={`${inputClass} pl-10`}
            />
            {searching && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
            )}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-beige-dark rounded-xl shadow-card overflow-hidden">
                {searchResults.map(s => (
                  <button
                    key={s.user_id}
                    type="button"
                    onMouseDown={() => selectSupplier(s)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-beige transition-colors border-b border-beige-dark/30 last:border-0"
                  >
                    <span className="font-semibold text-brown-dark">{s.first_name} {s.last_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-selected contract summary */}
          {loadingContracts && (
            <div className="flex items-center justify-center py-4 mt-3">
              <div className="w-5 h-5 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {selectedSupplier && !loadingContracts && (
            <div className="mt-4">
              {selectedContract ? (
                <div className="bg-green-pale rounded-xl px-4 py-3">
                  <p className="text-xs text-brown-light font-semibold uppercase tracking-wide mb-2">
                    Auto-selected Contract
                  </p>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <span className="font-semibold text-brown-dark">{selectedContract.contract_number}</span>
                      <span className="text-xs text-brown-light ml-2">Due {new Date(selectedContract.due_date).toLocaleDateString("en-PH")}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-green-dark">{(selectedContract._remainingKg ?? 0).toFixed(0)} kg</span>
                      <span className="text-xs text-brown-light"> remaining</span>
                    </div>
                  </div>
                  <p className="text-xs text-brown-light mt-2">
                    The system automatically chooses the supplier’s earliest active contract by due date for this delivery.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                  <LuCircleAlert className="w-4 h-4 shrink-0" />
                  No active contracts — this delivery will be priced at spot price.
                </div>
              )}
            </div>
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

        {/* Allocation preview */}
        {selectedSupplier && net > 0 && allocationPreview.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6">
            <h3 className="text-sm font-bold text-brown-dark mb-4 flex items-center gap-2">
              <LuPackage className="w-4 h-4 text-brown-light" /> Allocation Preview
            </h3>
            <div className="space-y-3">
              {allocationPreview.map((a, i) => (
                <div key={i} className={`rounded-xl px-4 py-3 flex items-center justify-between text-sm ${
                  a.price_type === "Spot" ? "bg-amber-50 border border-amber-100" : "bg-green-pale"
                }`}>
                  <div>
                    {a.contract_id
                      ? <>
                          <p className="font-semibold text-brown-dark">{a.contract_number}</p>
                          <p className="text-xs text-brown-light">Due {new Date(a.due_date).toLocaleDateString("en-PH")} · {peso(a.price_per_kg)}/kg</p>
                        </>
                      : <>
                          <p className="font-semibold text-amber-700">Spot Price</p>
                          <p className="text-xs text-amber-600">No eligible active contract · {peso(a.price_per_kg)}/kg</p>
                        </>
                    }
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-brown-dark">{a.allocated_weight_kg.toFixed(3)} kg</p>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      a.price_type === "Spot"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-white/60 text-green-dark"
                    }`}>
                      <LuCoins className="inline w-3 h-3 mr-0.5" />{a.price_type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate("/dashboard/weigher")}
            className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !selectedSupplier}
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
