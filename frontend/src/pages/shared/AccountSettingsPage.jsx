import { useState, useEffect } from "react";
import { LuUser, LuMail, LuPhone, LuMapPin, LuLock, LuCheck, LuTriangleAlert } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

// ─── small helpers ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6 mb-5">
      <h2 className="text-base font-bold text-brown-dark mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5 mb-4 last:mb-0">
      <label className="text-xs font-semibold text-brown-mid uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const isErr = toast.type === "error";
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold
      ${isErr ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-pale text-green-dark border border-green-light/40"}`}>
      {isErr ? <LuTriangleAlert className="w-4 h-4 shrink-0" /> : <LuCheck className="w-4 h-4 shrink-0" />}
      {toast.message}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function AccountSettingsPage() {
  const { profile, user, refreshProfile } = useAuth();

  const [profileForm, setProfileForm] = useState({ email: "", phone: "", address: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [toast, setToast] = useState(null);

  // Populate fields once profile loads
  useEffect(() => {
    if (profile) {
      setProfileForm({
        email:   profile.email   ?? "",
        phone:   profile.phone   ?? "",
        address: profile.address ?? "",
      });
    }
  }, [profile]);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Save profile info ──────────────────────────────────────────────────────
  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const email = profileForm.email.trim().toLowerCase();
      const emailChanged = email !== (profile?.email ?? "").toLowerCase();

      // 1. Update auth email if changed (Supabase sends confirmation to new address)
      if (emailChanged) {
        const { error: authErr } = await supabase.auth.updateUser({ email });
        if (authErr) throw new Error(authErr.message);
      }

      // 2. Update public.users profile row
      const { error: dbErr } = await supabase
        .from("users")
        .update({
          email:   email,
          phone:   profileForm.phone.trim() || null,
          address: profileForm.address.trim() || null,
        })
        .eq("user_id", user.id);

      if (dbErr) throw new Error(dbErr.message);

      await refreshProfile();

      showToast(
        "success",
        emailChanged
          ? "Profile updated. Check your new email inbox to confirm the address change."
          : "Profile updated successfully."
      );
    } catch (err) {
      showToast("error", err.message);
    }
    setProfileSaving(false);
  }

  // ── Change password ────────────────────────────────────────────────────────
  async function handlePasswordChange(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      showToast("error", "New passwords do not match.");
      return;
    }
    if (pwForm.next.length < 8) {
      showToast("error", "Password must be at least 8 characters.");
      return;
    }
    setPwSaving(true);
    try {
      // Re-authenticate with current password to verify identity
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    profile?.email ?? user?.email,
        password: pwForm.current,
      });
      if (signInErr) throw new Error("Current password is incorrect.");

      const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
      if (updateErr) throw new Error(updateErr.message);

      setPwForm({ current: "", next: "", confirm: "" });
      showToast("success", "Password changed successfully.");
    } catch (err) {
      showToast("error", err.message);
    }
    setPwSaving(false);
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-4 border-green-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuUser className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Account Settings</h1>
          <p className="text-brown-light text-sm">Update your contact details and password</p>
        </div>
      </div>

      {/* Read-only identity (locked) */}
      <Section title="Personal Information">
        <div className="grid grid-cols-2 gap-4 mb-2">
          <Field label="First Name">
            <input
              value={profile.first_name ?? ""}
              disabled
              className="w-full px-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                bg-beige text-brown-light cursor-not-allowed"
            />
          </Field>
          <Field label="Last Name">
            <input
              value={profile.last_name ?? ""}
              disabled
              className="w-full px-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                bg-beige text-brown-light cursor-not-allowed"
            />
          </Field>
        </div>
        <p className="text-xs text-brown-light flex items-center gap-1.5 mt-1">
          <LuTriangleAlert className="w-3.5 h-3.5 shrink-0" />
          First and last name cannot be changed after registration.
        </p>
      </Section>

      {/* Editable contact info */}
      <Section title="Contact Details">
        <form onSubmit={handleProfileSave}>
          <Field label="Email Address">
            <div className="relative">
              <LuMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input
                type="email"
                required
                value={profileForm.email}
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                  placeholder:text-brown-light/60 focus:outline-none focus:ring-2 focus:ring-green-dark/30
                  focus:border-green-dark transition-all"
                placeholder="your@email.com"
              />
            </div>
          </Field>
          <Field label="Contact Number">
            <div className="relative">
              <LuPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input
                type="tel"
                value={profileForm.phone}
                onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                  placeholder:text-brown-light/60 focus:outline-none focus:ring-2 focus:ring-green-dark/30
                  focus:border-green-dark transition-all"
                placeholder="+63 9XX XXX XXXX"
              />
            </div>
          </Field>
          <Field label="Address">
            <div className="relative">
              <LuMapPin className="absolute left-3 top-3 w-4 h-4 text-brown-light" />
              <textarea
                rows={3}
                value={profileForm.address}
                onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                  placeholder:text-brown-light/60 focus:outline-none focus:ring-2 focus:ring-green-dark/30
                  focus:border-green-dark transition-all resize-none"
                placeholder="Street, Barangay, City, Province"
              />
            </div>
          </Field>
          <button type="submit" disabled={profileSaving}
            className="w-full py-2.5 bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold
              text-sm rounded-xl hover:shadow-glow-green transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-1">
            {profileSaving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </Section>

      {/* Password change */}
      <Section title="Change Password">
        <form onSubmit={handlePasswordChange}>
          <Field label="Current Password">
            <div className="relative">
              <LuLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input
                type={showPw ? "text" : "password"}
                required
                value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                  focus:outline-none focus:ring-2 focus:ring-green-dark/30 focus:border-green-dark transition-all"
                placeholder="Enter current password"
              />
            </div>
          </Field>
          <Field label="New Password">
            <div className="relative">
              <LuLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                  focus:outline-none focus:ring-2 focus:ring-green-dark/30 focus:border-green-dark transition-all"
                placeholder="At least 8 characters"
              />
            </div>
          </Field>
          <Field label="Confirm New Password">
            <div className="relative">
              <LuLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input
                type={showPw ? "text" : "password"}
                required
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm
                  focus:outline-none focus:ring-2 focus:ring-green-dark/30 focus:border-green-dark transition-all"
                placeholder="Repeat new password"
              />
            </div>
          </Field>
          <label className="flex items-center gap-2 text-xs text-brown-mid mb-4 cursor-pointer select-none">
            <input type="checkbox" className="rounded" checked={showPw}
              onChange={e => setShowPw(e.target.checked)} />
            Show passwords
          </label>
          <button type="submit" disabled={pwSaving}
            className="w-full py-2.5 bg-gradient-to-r from-brown-dark to-brown-mid text-white font-semibold
              text-sm rounded-xl hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
            {pwSaving ? "Updating…" : "Update Password"}
          </button>
        </form>
      </Section>

      <Toast toast={toast} />
    </div>
  );
}
