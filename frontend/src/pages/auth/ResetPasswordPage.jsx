import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuLock, LuEye, LuEyeOff, LuCircleAlert, LuCircleCheck } from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import BrandLogo from "../../components/BrandLogo";

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase sends the recovery token in the URL hash.
  // The JS client automatically exchanges it for a session on SIGNED_IN + PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSessionReady(true);
      }
    });

    // Also check if already signed in (token exchanged before this component mounted)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message || "Failed to update password. The link may have expired.");
      return;
    }

    setSuccess(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate("/login"), 3000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4 py-12">
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

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-8">
          <h2 className="text-xl font-bold text-brown-dark mb-1">Set new password</h2>
          <p className="text-brown-light text-sm mb-6">Choose a strong password for your account.</p>

          {success ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 bg-green-pale rounded-full flex items-center justify-center">
                <LuCircleCheck className="w-8 h-8 text-green-dark" />
              </div>
              <div>
                <p className="font-bold text-green-dark text-lg">Password updated!</p>
                <p className="text-brown-light text-sm mt-1">Redirecting you to sign in…</p>
              </div>
            </div>
          ) : (
            <>
              {!sessionReady && (
                <div className="flex items-start gap-2.5 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-2xl px-4 py-3 mb-5 text-sm">
                  <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Validating your reset link… If nothing happens, the link may have expired. <a href="/login" className="underline font-medium">Request a new one.</a></span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm">
                  <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New password */}
                <div>
                  <label className="block text-sm font-medium text-brown-dark mb-1.5">New password</label>
                  <div className="relative">
                    <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-beige-dark bg-white/70
                                 text-brown-dark placeholder-brown-light/50 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
                                 transition-all duration-200"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                      {showPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-sm font-medium text-brown-dark mb-1.5">Confirm password</label>
                  <div className="relative">
                    <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                    <input
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter your new password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-beige-dark bg-white/70
                                 text-brown-dark placeholder-brown-light/50 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
                                 transition-all duration-200"
                    />
                    <button type="button" onClick={() => setShowConfirm(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                      {showConfirm ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Strength hint */}
                {password.length > 0 && (
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map(level => {
                      const score =
                        (password.length >= 8 ? 1 : 0) +
                        (/[A-Z]/.test(password) ? 1 : 0) +
                        (/[0-9]/.test(password) ? 1 : 0) +
                        (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
                      const filled = level <= score;
                      const color = score <= 1 ? "bg-red-400" : score === 2 ? "bg-yellow-400" : score === 3 ? "bg-blue-400" : "bg-green-mid";
                      return <div key={level} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${filled ? color : "bg-beige-dark"}`} />;
                    })}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !sessionReady}
                  className="w-full bg-gradient-to-r from-green-dark to-green-mid text-white font-bold py-3 rounded-xl
                             shadow-md hover:shadow-glow-green transition-all duration-300 disabled:opacity-60
                             disabled:cursor-not-allowed text-sm mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Updating…
                    </span>
                  ) : "Update Password"}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-brown-light mt-6">
            <a href="/login" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
              ← Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
