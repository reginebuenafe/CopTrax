import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuArrowLeft, LuScale, LuCircleAlert,
  LuCheck, LuCalendar, LuTruck, LuSearch, LuUser,
  LuFlag, LuX,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function ContractualDeliveryForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [supplierQuery, setSupplierQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const searchRef = useRef(null);

  const [form, setForm] = useState({
    deliveryDate: new Date().toISOString().split("T")[0],
    truckPlate: "",
    grossWeight: "",
    tareWeight: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [issueNote, setIssueNote] = useState("");
  const [issueError, setIssueError] = useState("");
  const [issueSaved, setIssueSaved] = useState(false);

  const gross = parseFloat(form.grossWeight) || 0;
  const tare = parseFloat(form.tareWeight) || 0;
  const net = gross > tare ? gross - tare : 0;

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

  useEffect(() => {
    function onClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectSupplier(supplier) {
    setSelectedSupplier(supplier);
    setSupplierQuery(`${supplier.first_name} ${supplier.last_name}`);
    setShowDropdown(false);
  }

  function set(field) {
    return e => setForm(current => ({ ...current, [field]: e.target.value }));
  }

  function validateForm() {
    if (!selectedSupplier) { setError("Search and select a supplier."); return false; }
    if (gross <= 0) { setError("Enter a valid gross weight."); return false; }
    if (tare < 0) { setError("Tare weight cannot be negative."); return false; }
    if (tare >= gross) { setError("Tare weight must be less than gross weight."); return false; }
    return true;
  }

  function handleReview(e) {
    e.preventDefault();
    setError("");
    if (validateForm()) setReviewing(true);
  }

  async function confirmSubmit() {
    setError("");
    setSubmitting(true);

    // The server RPC remains the sole source of truth for contract allocation.
    const { data: rpcData, error: rpcErr } = await supabase.rpc("record_contractual_delivery", {
      p_supplier_id: selectedSupplier.user_id,
      p_weigher_id: user.id,
      p_delivery_date: form.deliveryDate,
      p_truck_plate: form.truckPlate.trim() || "",
      p_gross_kg: gross,
      p_tare_kg: tare,
    });

    if (rpcErr) {
      setError("Failed to record delivery. Please try again.");
      setSubmitting(false);
      return;
    }
    if (rpcData?.error) {
      setError(rpcData.error);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setReviewing(false);
    setSuccess({
      deliveryId: rpcData.delivery_id,
      supplierName: `${selectedSupplier.first_name} ${selectedSupplier.last_name}`,
      deliveryDate: form.deliveryDate,
      grossWeight: gross,
      tareWeight: tare,
      netWeight: rpcData.net_kg ?? net,
    });
  }

  async function submitIssue() {
    const note = issueNote.trim();
    if (!note) { setIssueError("Describe the problem before submitting."); return; }

    setIssueError("");
    const { error: reportError } = await supabase.from("delivery_issue_reports").insert({
      delivery_id: success.deliveryId,
      reported_by: user.id,
      issue_note: note,
    });

    if (reportError) {
      setIssueError("Could not save the issue report. Please try again.");
      return;
    }

    setIssueNote("");
    setIssueSaved(true);
    setReportingIssue(false);
  }

  function resetForm() {
    setSuccess(null);
    setSelectedSupplier(null);
    setSupplierQuery("");
    setForm({ deliveryDate: new Date().toISOString().split("T")[0], truckPlate: "", grossWeight: "", tareWeight: "" });
    setError("");
    setIssueSaved(false);
  }

  const inputClass = `w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm
    placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all`;

  if (success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white border border-beige-dark/40 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-green-pale">
            <LuCheck className="w-8 h-8 text-green-dark" />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-2">Contractual Delivery Recorded</h2>
          <p className="text-brown-light text-sm mb-5">The delivery is recorded and awaiting laboratory inspection.</p>
          <div className="bg-beige rounded-xl px-4 py-3 text-left mb-6 text-sm space-y-1">
            <p className="text-brown-light text-xs font-semibold uppercase tracking-wide mb-2">Summary</p>
            <p className="text-brown-mid">Supplier: <span className="font-semibold text-brown-dark">{success.supplierName}</span></p>
            <p className="text-brown-mid">Delivery date: <span className="font-semibold text-brown-dark">{success.deliveryDate}</span></p>
            <p className="text-brown-mid">Gross weight: <span className="font-semibold text-brown-dark">{success.grossWeight.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">Tare weight: <span className="font-semibold text-brown-dark">{success.tareWeight.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">Net weight: <span className="font-semibold text-green-dark">{Number(success.netWeight).toFixed(2)} kg</span></p>
          </div>

          {issueSaved && <p className="text-sm text-green-dark mb-4">Issue report sent for staff review.</p>}
          <div className="flex gap-3">
            <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">Record Another</button>
            <button onClick={() => navigate("/dashboard/weigher/history")} className="flex-1 py-2.5 rounded-xl bg-green-dark text-white font-semibold text-sm hover:bg-green-dark/90 transition-all">View History</button>
          </div>
          <button type="button" onClick={() => setReportingIssue(true)} disabled={issueSaved}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800 disabled:opacity-50">
            <LuFlag className="w-4 h-4" /> Report Issue
          </button>
        </div>

        {reportingIssue && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-brown-dark/40 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-brown-dark">Report Issue</h3>
                <button type="button" onClick={() => setReportingIssue(false)} className="text-brown-light hover:text-brown-dark"><LuX /></button>
              </div>
              <p className="text-sm text-brown-light mb-3">Describe any problem with this delivery or weighing entry.</p>
              <textarea value={issueNote} onChange={e => setIssueNote(e.target.value)} rows={4} maxLength={1000}
                placeholder="Enter the issue or correction needed..." className={`${inputClass} resize-none`} />
              {issueError && <p className="text-sm text-red-700 mt-2">{issueError}</p>}
              <button type="button" onClick={submitIssue} className="w-full mt-4 py-2.5 rounded-xl bg-red-700 text-white font-semibold text-sm hover:bg-red-800 transition-all">Submit Issue Report</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/dashboard/weigher")} className="text-brown-light hover:text-brown-dark transition-colors"><LuArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Contractual Delivery</h1>
          <p className="text-brown-light text-sm mt-0.5">Enter the delivery details for automatic system processing</p>
        </div>
      </div>

      {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm"><LuCircleAlert className="w-4 h-4 shrink-0" /> {error}</div>}

      <form onSubmit={handleReview} className="space-y-5">
        <div className="bg-white border border-beige-dark/40 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-brown-dark mb-4 flex items-center gap-2"><LuUser className="w-4 h-4 text-brown-light" /> Search Supplier</h3>
          <div className="relative" ref={searchRef}>
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
            <input type="text" value={supplierQuery} onChange={e => {
              setSupplierQuery(e.target.value);
              if (selectedSupplier && e.target.value !== `${selectedSupplier.first_name} ${selectedSupplier.last_name}`) setSelectedSupplier(null);
            }} onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }} placeholder="Type supplier name…" className={`${inputClass} pl-10`} />
            {searching && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />}
            {showDropdown && searchResults.length > 0 && <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-beige-dark rounded-xl shadow-card overflow-hidden">
              {searchResults.map(s => <button key={s.user_id} type="button" onMouseDown={() => selectSupplier(s)} className="w-full text-left px-4 py-3 text-sm hover:bg-beige transition-colors border-b border-beige-dark/30 last:border-0"><span className="font-semibold text-brown-dark">{s.first_name} {s.last_name}</span></button>)}
            </div>}
          </div>
          {selectedSupplier && <p className="mt-3 text-sm text-green-dark font-semibold">Selected: {selectedSupplier.first_name} {selectedSupplier.last_name}</p>}
        </div>

        <div className="bg-white border border-beige-dark/40 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-brown-dark mb-4 flex items-center gap-2"><LuTruck className="w-4 h-4 text-brown-light" /> Delivery Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-brown-dark mb-1.5"><LuCalendar className="inline w-3 h-3 mr-1" /> Delivery Date <span className="text-red-500">*</span></label><input type="date" required value={form.deliveryDate} onChange={set("deliveryDate")} className={inputClass} /></div>
            <div><label className="block text-xs font-medium text-brown-dark mb-1.5">Truck Plate Number</label><input type="text" value={form.truckPlate} onChange={set("truckPlate")} placeholder="ABC 1234" className={inputClass} /></div>
          </div>
        </div>

        <div className="bg-white border border-beige-dark/40 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-brown-dark mb-4 flex items-center gap-2"><LuScale className="w-4 h-4 text-brown-light" /> Weighing Record</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="block text-xs font-medium text-brown-dark mb-1.5">Gross Weight (kg) <span className="text-red-500">*</span></label><input type="number" step="0.001" min="0.001" required value={form.grossWeight} onChange={set("grossWeight")} placeholder="0.000" className={inputClass} /></div>
            <div><label className="block text-xs font-medium text-brown-dark mb-1.5">Tare Weight (kg) <span className="text-red-500">*</span></label><input type="number" step="0.001" min="0" required value={form.tareWeight} onChange={set("tareWeight")} placeholder="0.000" className={inputClass} /></div>
            <div><label className="block text-xs font-medium text-brown-dark mb-1.5">Net Weight (kg)</label><div className={`${inputClass} bg-green-pale border-green-mid/30 font-bold text-green-dark`}>{net > 0 ? net.toFixed(2) : "—"}</div></div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate("/dashboard/weigher")} className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">Cancel</button>
          <button type="submit" disabled={!selectedSupplier} className="flex-1 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all disabled:opacity-60">Review Delivery</button>
        </div>
      </form>

      {reviewing && <div className="fixed inset-0 z-30 flex items-center justify-center bg-brown-dark/40 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-card">
          <h3 className="text-lg font-bold text-brown-dark mb-1">Review Delivery</h3>
          <p className="text-sm text-brown-light mb-4">Confirm these weighing details before saving.</p>
          <div className="bg-beige rounded-xl p-4 text-sm space-y-2">
            <p className="text-brown-mid">Supplier: <span className="font-semibold text-brown-dark">{selectedSupplier?.first_name} {selectedSupplier?.last_name}</span></p>
            <p className="text-brown-mid">Delivery date: <span className="font-semibold text-brown-dark">{form.deliveryDate}</span></p>
            <p className="text-brown-mid">Gross weight: <span className="font-semibold text-brown-dark">{gross.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">Tare weight: <span className="font-semibold text-brown-dark">{tare.toFixed(2)} kg</span></p>
            <p className="text-brown-mid">Net weight: <span className="font-semibold text-green-dark">{net.toFixed(2)} kg</span></p>
          </div>
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={() => setReviewing(false)} disabled={submitting} className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige disabled:opacity-60">Edit</button>
            <button type="button" onClick={confirmSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-green-dark text-white font-semibold text-sm hover:bg-green-dark/90 disabled:opacity-60">{submitting ? "Saving…" : "Confirm & Submit"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
