import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuLeaf, LuMail, LuLock, LuEye, LuEyeOff, LuUser, LuPhone,
  LuMapPin, LuCircleAlert, LuChevronDown,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

const ROLES = ["Supplier", "Weigher", "Laboratory Staff"];

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    role: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.role) { setError("Please select your role."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);

    // 1. Create auth user — trigger creates public.users row automatically
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { role: form.role },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Fill in the profile details
    const { error: profileError } = await supabase
      .from("users")
      .update({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      })
      .eq("user_id", data.user.id);

    setLoading(false);

    if (profileError) {
      setError("Account created but profile update failed. Please contact support.");
      return;
    }

    // Sign out immediately — account is Pending until Business Owner approves
    await supabase.auth.signOut();
    navigate("/pending-approval");
  }

  const inputClass = `w-full py-2.5 rounded-xl border border-beige-dark bg-white/70
    text-brown-dark placeholder-brown-light/50 text-sm
    focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
    transition-all duration-200`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-light/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-green-mid/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-green-dark to-green-light rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <LuLeaf className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-green-dark tracking-tight">CopTrax</h1>
          <p className="text-brown-light text-sm mt-1">NERC Copra Trading — Staff Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-8">
          <h2 className="text-xl font-bold text-brown-dark mb-1">Create an account</h2>
          <p className="text-brown-light text-sm mb-6">
            Your account will be reviewed by NERC before you can log in.
          </p>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
              <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role selector */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                I am a <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LuChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
                <select
                  required
                  value={form.role}
                  onChange={set("role")}
                  className={`${inputClass} pl-4 pr-10 appearance-none`}
                >
                  <option value="">Select your role…</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1.5">
                  First name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <LuUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                  <input
                    type="text" required value={form.firstName} onChange={set("firstName")}
                    placeholder="Juan"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1.5">
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" required value={form.lastName} onChange={set("lastName")}
                  placeholder="dela Cruz"
                  className={`${inputClass} px-4`}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Email address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LuMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input
                  type="email" required value={form.email} onChange={set("email")}
                  placeholder="you@example.com"
                  className={`${inputClass} pl-10`}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Phone number
              </label>
              <div className="relative">
                <LuPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input
                  type="tel" value={form.phone} onChange={set("phone")}
                  placeholder="+63 9XX XXX XXXX"
                  className={`${inputClass} pl-10`}
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Address
              </label>
              <div className="relative">
                <LuMapPin className="absolute left-3.5 top-3 w-4 h-4 text-brown-light" />
                <textarea
                  rows={2} value={form.address} onChange={set("address")}
                  placeholder="Barangay, Municipality, Province"
                  className={`${inputClass} pl-10 resize-none`}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input
                  type={showPassword ? "text" : "password"} required
                  value={form.password} onChange={set("password")}
                  placeholder="Min. 8 characters"
                  className={`${inputClass} pl-10 pr-10`}
                />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                  {showPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Confirm password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input
                  type={showConfirm ? "text" : "password"} required
                  value={form.confirmPassword} onChange={set("confirmPassword")}
                  placeholder="Re-enter password"
                  className={`${inputClass} pl-10 pr-10`}
                />
                <button type="button" onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                  {showConfirm ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-green-dark to-green-mid text-white font-bold py-3 rounded-xl
                         shadow-md hover:shadow-glow-green transition-all duration-300 disabled:opacity-60
                         disabled:cursor-not-allowed text-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-brown-light mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
