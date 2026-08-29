import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuMail, LuLock, LuEye, LuEyeOff, LuCircleAlert, LuArrowLeft } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import BrandLogo from "../../components/BrandLogo";
import { useAuth } from "../../contexts/AuthContext";

const ROLE_REDIRECT = {
  "Business Owner": "/dashboard/owner",
  "Supplier": "/dashboard/supplier",
  "Weigher": "/dashboard/weigher",
  "Laboratory Staff": "/dashboard/lab",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isLoading, role, accountStatus } = useAuth();

  // Suppress dark mode on auth pages
  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme") ?? "";
    document.documentElement.setAttribute("data-theme", "");
    return () => { if (prev) document.documentElement.setAttribute("data-theme", prev); };
  }, []);

  // Set to true after a successful signInWithPassword so the useEffect below
  // knows to wait for AuthContext to finish loading before redirecting.
  const signingInRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Show a one-time message from the ?reason= query param, then clear it from
  // the URL so a page re-render (or back-navigation) doesn't re-apply it.
  const reason = params.get("reason");
  const [error, setError] = useState(
    reason === "rejected"
      ? "Your account registration was declined. Please contact NERC Copra Trading."
      : reason === "expired"
      ? "Your session has expired. Please log in again."
      : reason === "deleted"
      ? "Your account has been deactivated. Please contact NERC Copra Trading."
      : ""
  );
  useEffect(() => {
    if (reason) {
      setParams({}, { replace: true }); // remove ?reason= so it can't persist
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // After signInWithPassword succeeds, AuthContext will fetch the profile via
  // onAuthStateChange. Wait for isLoading to become false, then redirect using
  // the now-resolved role and accountStatus from AuthContext.
  useEffect(() => {
    if (!signingInRef.current) return;
    if (isLoading) return; // still fetching profile — keep waiting

    signingInRef.current = false;
    setLoading(false);

    if (!role && !accountStatus) {
      // Profile not found even after loading finished
      setError("Account profile not found. Please contact support.");
      supabase.auth.signOut();
      return;
    }

    if (accountStatus === "Pending") { navigate("/pending-approval"); return; }
    if (accountStatus === "Rejected") {
      supabase.auth.signOut();
      setError("Your account registration was declined. Please contact NERC Copra Trading.");
      return;
    }
    if (accountStatus === "Deleted") {
      supabase.auth.signOut();
      setError("Your account has been deactivated. Please contact NERC Copra Trading.");
      return;
    }

    if (role === "Supplier") {
      localStorage.setItem("coptrax_chat_widget_open", "false");
    }
    navigate(ROLE_REDIRECT[role] ?? "/");
  }, [isLoading, role, accountStatus, navigate]);

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!email) { setError("Enter your email address first."); return; }
    setForgotLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (resetError) {
      setError("Could not send reset email. Check the address and try again.");
    } else {
      setForgotSent(true);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Trim email to prevent autofill trailing-space false failures
    const trimmedEmail = email.trim();

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    trimmedEmail,
        password,
      });

      if (authError) {
        const msg = authError.message?.toLowerCase() ?? "";
        if (authError.status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
          setError("Too many login attempts. Please wait a moment and try again.");
        } else if (msg.includes("invalid login") || msg.includes("invalid email") || msg.includes("wrong password") || authError.status === 400) {
          setError("Invalid email or password. Please check your credentials.");
        } else if (msg.includes("email not confirmed")) {
          setError("Please confirm your email address before logging in.");
        } else if (authError.status >= 500 || msg.includes("network") || msg.includes("fetch")) {
          setError("A server error occurred. Please try again in a moment.");
        } else {
          setError("Login failed. Please try again.");
        }
        console.error("[login] auth error:", authError.status, authError.message);
        setLoading(false);
        return;
      }

      // Auth succeeded — hand off to the useEffect below which waits for
      // AuthContext to finish loading the profile before redirecting.
      signingInRef.current = true;
    } catch (err) {
      // Unexpected throw (network failure, Supabase client error, etc.)
      console.error("[login] unexpected error:", err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4 py-12">
      <Link to="/" aria-label="Back to homepage"
        className="fixed top-5 left-5 z-20 flex items-center gap-2 rounded-xl border border-beige-dark bg-white/85 px-3.5 py-2 text-sm font-semibold text-brown-mid shadow-sm backdrop-blur hover:bg-white hover:text-green-dark transition-all">
        <LuArrowLeft className="w-4 h-4 text-green-dark" />
      </Link>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-light/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-green-mid/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-green-dark to-green-light rounded-2xl flex items-center justify-center shadow-lg mb-3 p-2">
            <BrandLogo className="w-full h-full" size="100%" />
          </div>
          <h1 className="text-2xl font-extrabold text-green-dark tracking-tight">CopTrax</h1>
          <p className="text-brown-light text-sm mt-1">NERC Copra Trading Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-8">
          <h2 className="text-xl font-bold text-brown-dark mb-1">Welcome back</h2>
          <p className="text-brown-light text-sm mb-6">Sign in to your account</p>

          {/* Forgot password sent */}
          {forgotSent && (
            <div className="flex items-start gap-2.5 bg-green-pale border border-green-mid/30 text-green-dark rounded-2xl px-4 py-3 mb-5 text-sm">
              <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Password reset email sent to <strong>{email}</strong>. Check your inbox.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
              <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {forgotMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1.5">Email address</label>
                <div className="relative">
                  <LuMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white/70
                      text-brown-dark placeholder-brown-light/50 text-sm
                      focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all duration-200" />
                </div>
              </div>
              <button type="submit" disabled={forgotLoading}
                className="w-full bg-gradient-to-r from-green-dark to-green-mid text-white font-bold py-3 rounded-xl
                  shadow-md hover:shadow-glow-green transition-all duration-300 disabled:opacity-60 text-sm">
                {forgotLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : "Send Reset Link"}
              </button>
              <button type="button" onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }}
                className="w-full text-sm text-brown-light hover:text-brown-dark transition-colors py-1">
                ← Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Email address
              </label>
              <div className="relative">
                <LuMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white/70
                             text-brown-dark placeholder-brown-light/50 text-sm
                             focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
                             transition-all duration-200"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Password
              </label>
              <div className="relative">
                <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-beige-dark bg-white/70
                             text-brown-dark placeholder-brown-light/50 text-sm
                             focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
                             transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors"
                >
                  {showPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="text-right">
              <button type="button" onClick={() => { setForgotMode(true); setError(""); }}
                className="text-xs text-brown-light hover:text-green-dark transition-colors font-medium">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-dark to-green-mid text-white font-bold py-3 rounded-xl
                         shadow-md hover:shadow-glow-green transition-all duration-300 disabled:opacity-60
                         disabled:cursor-not-allowed text-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>
          </form>
          )}

          <p className="text-center text-sm text-brown-light mt-6">
            New supplier?{" "}
            <Link to="/register" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
