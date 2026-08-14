import { useState, useEffect, useCallback } from "react";
import {
  LuUser, LuMail, LuPhone, LuMapPin, LuLock, LuCheck, LuTriangleAlert,
  LuLandmark, LuPenLine, LuUpload,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

/* ─── small helpers ───────────────────────────────────────────────────────── */

function Section({ title, children, icon: Icon }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-6 mb-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-4 h-4 text-green-dark" />}
        <h2 className="text-base font-bold text-brown-dark">{title}</h2>
      </div>
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

const inputBase = "w-full px-4 py-2.5 rounded-xl border border-beige-dark text-brown-dark text-sm placeholder:text-brown-light/60 focus:outline-none focus:ring-2 focus:ring-green-dark/30 focus:border-green-dark transition-all";
const inputLocked = "w-full px-4 py-2.5 rounded-xl border border-beige-dark text-sm bg-beige text-brown-light cursor-not-allowed";

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════════ */

export default function AccountSettingsPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [toast, setToast] = useState(null);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  /* ── Contact details ──────────────────────────────────────────────────── */
  const [profileForm, setProfileForm] = useState({ email: "", phone: "", address: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        email:   profile.email   ?? "",
        phone:   profile.phone   ?? "",
        address: profile.address ?? "",
      });
    }
  }, [profile]);

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const email = profileForm.email.trim().toLowerCase();
      const emailChanged = email !== (profile?.email ?? "").toLowerCase();
      if (emailChanged) {
        const { error: authErr } = await supabase.auth.updateUser({ email });
        if (authErr) throw new Error(authErr.message);
      }
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
      showToast("success", emailChanged
        ? "Profile updated. Check your new email inbox to confirm the address change."
        : "Profile updated successfully.");
    } catch (err) {
      showToast("error", err.message);
    }
    setProfileSaving(false);
  }

  /* ── Password change ──────────────────────────────────────────────────── */
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) return showToast("error", "New passwords do not match.");
    if (pwForm.next.length < 8) return showToast("error", "Password must be at least 8 characters.");
    setPwSaving(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? user?.email, password: pwForm.current,
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

  const isSupplier = profile.roles?.role_name === "Supplier";
  const isBO       = profile.roles?.role_name === "Business Owner";

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuUser className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">Account Settings</h1>
          <p className="text-brown-light text-sm">Manage your account details and security</p>
        </div>
      </div>

      {/* Read-only identity */}
      <Section title="Personal Information" icon={LuUser}>
        <div className="grid grid-cols-2 gap-4 mb-2">
          <Field label="First Name">
            <input value={profile.first_name ?? ""} disabled className={inputLocked} />
          </Field>
          <Field label="Last Name">
            <input value={profile.last_name ?? ""} disabled className={inputLocked} />
          </Field>
        </div>
        <p className="text-xs text-brown-light flex items-center gap-1.5 mt-1">
          <LuTriangleAlert className="w-3.5 h-3.5 shrink-0" />
          First and last name cannot be changed after registration.
        </p>
      </Section>

      {/* Contact info */}
      <Section title="Contact Details" icon={LuMail}>
        <form onSubmit={handleProfileSave}>
          <Field label="Email Address">
            <div className="relative">
              <LuMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type="email" required value={profileForm.email}
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                className={inputBase + " pl-9"} placeholder="your@email.com" />
            </div>
          </Field>
          <Field label="Contact Number">
            <div className="relative">
              <LuPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type="tel" value={profileForm.phone}
                onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                className={inputBase + " pl-9"} placeholder="+63 9XX XXX XXXX" />
            </div>
          </Field>
          <Field label="Address">
            <div className="relative">
              <LuMapPin className="absolute left-3 top-3 w-4 h-4 text-brown-light" />
              <textarea rows={3} value={profileForm.address}
                onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                className={inputBase + " pl-9 resize-none"} placeholder="Street, Barangay, City, Province" />
            </div>
          </Field>
          <button type="submit" disabled={profileSaving}
            className="w-full py-2.5 bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm rounded-xl hover:shadow-glow-green transition-all disabled:opacity-60 mt-1">
            {profileSaving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </Section>

      {/* Bank & signature sections — different for each role */}
      {(isSupplier || isBO) && (
        <>
          <BankAccountSection showToast={showToast} />
          <SignatureSection showToast={showToast} />
        </>
      )}

      {/* Password */}
      <Section title="Change Password" icon={LuLock}>
        <form onSubmit={handlePasswordChange}>
          <Field label="Current Password">
            <div className="relative">
              <LuLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type={showPw ? "text" : "password"} required value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                className={inputBase + " pl-9"} placeholder="Enter current password" />
            </div>
          </Field>
          <Field label="New Password">
            <div className="relative">
              <LuLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type={showPw ? "text" : "password"} required minLength={8} value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                className={inputBase + " pl-9"} placeholder="At least 8 characters" />
            </div>
          </Field>
          <Field label="Confirm New Password">
            <div className="relative">
              <LuLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type={showPw ? "text" : "password"} required value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className={inputBase + " pl-9"} placeholder="Repeat new password" />
            </div>
          </Field>
          <label className="flex items-center gap-2 text-xs text-brown-mid mb-4 cursor-pointer select-none">
            <input type="checkbox" className="rounded" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
            Show passwords
          </label>
          <button type="submit" disabled={pwSaving}
            className="w-full py-2.5 bg-gradient-to-r from-brown-dark to-brown-mid text-white font-semibold text-sm rounded-xl hover:opacity-90 transition-all disabled:opacity-60">
            {pwSaving ? "Updating…" : "Update Password"}
          </button>
        </form>
      </Section>

      <Toast toast={toast} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BANK ACCOUNT SECTION — editable by both Supplier and BO
   ═══════════════════════════════════════════════════════════════════════════ */

function BankAccountSection({ showToast }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ bank_name: "", account_name: "", account_number: "" });
  const [saving, setSaving]   = useState(false);

  const loadBank = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("bank_accounts").select("*").eq("user_id", user.id).maybeSingle();
    if (data) setForm({ bank_name: data.bank_name, account_name: data.account_name, account_number: data.account_number });
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadBank(); }, [loadBank]);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.bank_name.trim() || !form.account_name.trim() || !form.account_number.trim()) {
      return showToast("error", "All bank fields are required.");
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("bank_accounts").upsert({
        user_id:        user.id,
        bank_name:      form.bank_name.trim(),
        account_name:   form.account_name.trim(),
        account_number: form.account_number.trim(),
        updated_at:     new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      showToast("success", "Bank information saved.");
    } catch (err) {
      showToast("error", err.message);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <Section title="Bank Account for Payouts" icon={LuLandmark}>
        <div className="h-16 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
        </div>
      </Section>
    );
  }

  return (
    <Section title="Bank Account for Payouts" icon={LuLandmark}>
      <form onSubmit={handleSave}>
        <Field label="Bank Name">
          <input value={form.bank_name}
            onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
            className={inputBase} placeholder="e.g. BDO, BPI, Metrobank" />
        </Field>
        <Field label="Account Holder Name">
          <input value={form.account_name}
            onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
            className={inputBase} placeholder="Exactly as on the account" />
        </Field>
        <Field label="Account Number">
          <input value={form.account_number}
            onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
            className={inputBase} placeholder="e.g. 001234567890" />
        </Field>
        <button type="submit" disabled={saving}
          className="w-full py-2.5 bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm rounded-xl hover:shadow-glow-green transition-all disabled:opacity-60 mt-1">
          {saving ? "Saving…" : "Save Bank Information"}
        </button>
      </form>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIGNATURE SECTION — view + upload/change (both roles)
   ═══════════════════════════════════════════════════════════════════════════ */

function SignatureSection({ showToast }) {
  const { user } = useAuth();
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [uploading, setUploading]       = useState(false);

  const loadSignature = useCallback(async () => {
    setLoading(true);
    const { data: verify } = await supabase
      .from("user_verify").select("esign_file_id").eq("user_id", user.id).maybeSingle();

    if (verify?.esign_file_id) {
      const { data: file } = await supabase
        .from("file_uploads").select("file_url").eq("file_id", verify.esign_file_id).maybeSingle();
      if (file?.file_url) {
        // file_url is a storage path; generate a signed URL for preview
        const { data: signed } = await supabase.storage.from("documents").createSignedUrl(file.file_url, 300);
        setSignatureUrl(signed?.signedUrl ?? null);
      } else {
        setSignatureUrl(null);
      }
    } else {
      setSignatureUrl(null);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadSignature(); }, [loadSignature]);

  async function handleUpload(fileObj) {
    if (!fileObj) return;
    if (!fileObj.type.startsWith("image/")) {
      return showToast("error", "Please choose an image file.");
    }
    if (fileObj.size > 10 * 1024 * 1024) {
      return showToast("error", "Image is too large (max 10 MB).");
    }

    setUploading(true);
    try {
      const ext = fileObj.name.split(".").pop() || "png";
      const path = `${user.id}/E-Sign-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, fileObj, { contentType: fileObj.type, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: fileRow, error: fileErr } = await supabase.from("file_uploads").insert({
        uploaded_by:   user.id,
        file_category: "E-Sign",
        file_name:     fileObj.name,
        file_url:      path,
        file_size:     fileObj.size,
      }).select("file_id").single();
      if (fileErr) throw new Error(fileErr.message);

      // Upsert user_verify with new esign_file_id
      const { data: existing } = await supabase
        .from("user_verify").select("verify_id").eq("user_id", user.id).maybeSingle();

      if (existing) {
        const { error: upErr } = await supabase.from("user_verify")
          .update({ esign_file_id: fileRow.file_id })
          .eq("user_id", user.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        const { error: insErr } = await supabase.from("user_verify").insert({
          user_id: user.id, esign_file_id: fileRow.file_id, verify_status: "Approved",
        });
        if (insErr) throw new Error(insErr.message);
      }

      await loadSignature();
      showToast("success", "Signature updated. It will be used for future contract signing.");
    } catch (err) {
      showToast("error", err.message);
    }
    setUploading(false);
  }

  return (
    <Section title="Electronic Signature" icon={LuPenLine}>
      <p className="text-xs text-brown-light mb-4">
        This signature is applied automatically when you sign contracts in CopTrax.
      </p>

      {/* Preview */}
      <div className="bg-beige rounded-2xl p-4 mb-4 flex items-center justify-center min-h-[140px]">
        {loading ? (
          <div className="w-5 h-5 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
        ) : signatureUrl ? (
          <img src={signatureUrl} alt="Your signature"
            className="max-h-32 object-contain rounded-lg bg-white p-2 shadow-sm" />
        ) : (
          <p className="text-sm text-brown-light italic">No signature on file yet.</p>
        )}
      </div>

      {/* Upload */}
      <label className={`w-full py-2.5 rounded-xl border-2 border-dashed border-green-dark/40 flex items-center justify-center gap-2 cursor-pointer transition-all hover:bg-green-pale/30 ${uploading ? "opacity-60 cursor-wait" : ""}`}>
        <LuUpload className="w-4 h-4 text-green-dark" />
        <span className="text-sm font-semibold text-green-dark">
          {uploading ? "Uploading…" : signatureUrl ? "Replace Signature" : "Upload Signature"}
        </span>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
          className="hidden"
        />
      </label>
      <p className="text-[11px] text-brown-light mt-2 leading-relaxed">
        Tip: Sign on plain white paper with a black or blue pen, then take a clear, well-lit photo.
      </p>
    </Section>
  );
}
