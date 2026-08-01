// Shared modal for the Business Owner to create Weigher or Laboratory Staff accounts.
// Used from OwnerOverview (dashboard quick-action) and UserApprovalsPage (user management).
import { useState } from "react";
import {
  LuUserPlus, LuX, LuCheck, LuLoader, LuCircleAlert,
  LuScale, LuFlaskConical,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";

const STAFF_ROLES = ["Weigher", "Laboratory Staff"];

export default function CreateStaffModal({ onClose, onCreated, defaultRole = "Weigher" }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    address: "", role_name: defaultRole, password: "", confirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); setErr(""); }

  async function submit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setErr("Passwords do not match."); return; }
    if (form.password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await supabase.functions.invoke("create-staff-account", {
        body: {
          first_name: form.first_name.trim(),
          last_name:  form.last_name.trim(),
          email:      form.email.trim().toLowerCase(),
          phone:      form.phone.trim() || undefined,
          address:    form.address.trim() || undefined,
          role_name:  form.role_name,
          password:   form.password,
        },
      });
      if (res.error || res.data?.error) {
        throw new Error(res.data?.error ?? res.error?.message ?? "Unknown error");
      }
      onCreated(form.first_name, form.last_name, form.role_name);
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  }

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark " +
    "placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-beige-dark/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-pale rounded-xl flex items-center justify-center">
              <LuUserPlus className="w-4 h-4 text-green-dark" />
            </div>
            <div>
              <h3 className="text-base font-bold text-brown-dark">Create Staff Account</h3>
              <p className="text-brown-light text-xs">Account is Active immediately — no approval step</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Role selector */}
          <div>
            <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Role</label>
            <div className="flex gap-2">
              {STAFF_ROLES.map(r => (
                <button key={r} type="button" onClick={() => update("role_name", r)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    form.role_name === r
                      ? "border-green-dark bg-green-pale text-green-dark"
                      : "border-beige-dark bg-white text-brown-mid hover:bg-beige"
                  }`}>
                  {r === "Weigher" ? <LuScale className="w-4 h-4" /> : <LuFlaskConical className="w-4 h-4" />}
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">First Name *</label>
              <input required value={form.first_name} onChange={e => update("first_name", e.target.value)}
                placeholder="Juan" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Last Name *</label>
              <input required value={form.last_name} onChange={e => update("last_name", e.target.value)}
                placeholder="Dela Cruz" className={inputCls} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Email *</label>
            <input required type="email" value={form.email} onChange={e => update("email", e.target.value)}
              placeholder="staff@example.com" className={inputCls} />
          </div>

          {/* Phone + Address */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Phone</label>
              <input value={form.phone} onChange={e => update("phone", e.target.value)}
                placeholder="+63 9XX XXX XXXX" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Address</label>
              <input value={form.address} onChange={e => update("address", e.target.value)}
                placeholder="City, Province" className={inputCls} />
            </div>
          </div>

          {/* Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Password *</label>
              <input required type="password" value={form.password} onChange={e => update("password", e.target.value)}
                placeholder="Min. 8 characters" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brown-mid mb-1.5 uppercase tracking-wide">Confirm Password *</label>
              <input required type="password" value={form.confirm} onChange={e => update("confirm", e.target.value)}
                placeholder="Repeat password" className={inputCls} />
            </div>
          </div>

          {err && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs">
              <LuCircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {err}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <LuLoader className="w-4 h-4 animate-spin" /> : <LuCheck className="w-4 h-4" />}
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
