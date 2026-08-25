import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const SENSITIVE_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const WARNING_DURATION_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

export function AuthProvider({ children }) {
  const [session, setSession]               = useState(undefined); // undefined = loading
  const [profile, setProfile]               = useState(null);
  // Start as true: keeps isLoading=true until the first auth event resolves,
  // preventing a race window where session is set but profileLoading is still false.
  const [profileLoading, setProfileLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sensitiveContextCount, setSensitiveContextCount] = useState(0);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [warningSeconds, setWarningSeconds] = useState(60);

  const wasAuthenticatedRef  = useRef(false);
  const explicitSignOutRef   = useRef(false);
  const loadedUserIdRef      = useRef(null);
  const warningTimerRef      = useRef(null);
  const inactivityTimerRef   = useRef(null);
  const countdownTimerRef    = useRef(null);
  const warningOpenRef       = useRef(false);
  const logoutDeadlineRef    = useRef(0);
  const lastActivityRef      = useRef(0);
  const inactivityTimeoutMsRef = useRef(DEFAULT_INACTIVITY_TIMEOUT_MS);

  const inactivityTimeoutMs = sensitiveContextCount > 0
    ? SENSITIVE_INACTIVITY_TIMEOUT_MS
    : DEFAULT_INACTIVITY_TIMEOUT_MS;

  useEffect(() => {
    inactivityTimeoutMsRef.current = inactivityTimeoutMs;
  }, [inactivityTimeoutMs]);

  const fetchProfile = useCallback(async (userId) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from("users")
      .select("*, roles(role_name)")
      .eq("user_id", userId)
      .single();
    setProfile(data);
    setProfileLoading(false);
  }, []);

  // ── Inactivity timer ──────────────────────────────────────────────────────
  const clearInactivityTimer = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    warningOpenRef.current = false;
    setShowIdleWarning(false);
    setWarningSeconds(60);

    const timeoutMs = inactivityTimeoutMsRef.current;
    logoutDeadlineRef.current = Date.now() + timeoutMs;
    warningTimerRef.current = setTimeout(() => {
      warningOpenRef.current = true;
      setShowIdleWarning(true);
      setWarningSeconds(60);
      countdownTimerRef.current = setInterval(() => {
        const secondsRemaining = Math.max(
          0,
          Math.ceil((logoutDeadlineRef.current - Date.now()) / 1000),
        );
        setWarningSeconds(secondsRemaining);
      }, 1000);
    }, timeoutMs - WARNING_DURATION_MS);

    inactivityTimerRef.current = setTimeout(async () => {
      if (wasAuthenticatedRef.current) {
        explicitSignOutRef.current = false;
        await supabase.auth.signOut();
      }
    }, timeoutMs);
  }, [clearInactivityTimer]);

  const handleActivity = useCallback(() => {
    // Once the warning is visible, require an explicit confirmation. This avoids
    // a stray mouse movement silently extending a sensitive session.
    if (warningOpenRef.current) return;
    const now = Date.now();
    if (now - lastActivityRef.current < 1000) return;
    lastActivityRef.current = now;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const staySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const beginSensitiveContext = useCallback(() => {
    setSensitiveContextCount((count) => count + 1);
  }, []);

  const endSensitiveContext = useCallback(() => {
    setSensitiveContextCount((count) => Math.max(0, count - 1));
  }, []);

  // ── Auth state ────────────────────────────────────────────────────────────
  // Supabase fires INITIAL_SESSION via onAuthStateChange on mount, so we rely
  // solely on that listener — no separate getSession() call — to avoid a
  // double-fetch race where two concurrent fetchProfile calls could leave
  // profileLoading=false while profile is still null.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        wasAuthenticatedRef.current = true;
        setSession(session);
        setSessionExpired(false);
        resetInactivityTimer();

        // Supabase re-fires auth events (TOKEN_REFRESHED, sometimes even
        // SIGNED_IN again) whenever a tab/window regains focus — this is
        // NOT a new login. Refetching the profile every time flips
        // profileLoading (and therefore isLoading) back to true, which
        // makes ProtectedRoute unmount the current page and lose any
        // in-progress form input. Only refetch when the session actually
        // belongs to a different user than the one already loaded.
        if (loadedUserIdRef.current !== session.user.id) {
          loadedUserIdRef.current = session.user.id;
          fetchProfile(session.user.id);
        }
      } else {
        loadedUserIdRef.current = null;
        if (event === "SIGNED_OUT") {
          if (wasAuthenticatedRef.current && !explicitSignOutRef.current) {
            setSessionExpired(true); // expired or inactivity timeout
          } else {
            setSessionExpired(false);
          }
          wasAuthenticatedRef.current = false;
          explicitSignOutRef.current  = false;
        }
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
        clearInactivityTimer();
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, resetInactivityTimer, clearInactivityTimer]);

  // ── Activity listeners ────────────────────────────────────────────────────
  // Only attach when there is an active session; detach on sign-out
  useEffect(() => {
    if (!session) return;

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, handleActivity)
      );
    };
  }, [session, handleActivity]);

  // Switching into or out of a sensitive page changes the timeout duration.
  // Keep auth initialization stable and only restart the existing idle timer.
  useEffect(() => {
    if (!session) return undefined;
    const timerId = window.setTimeout(resetInactivityTimer, 0);
    return () => window.clearTimeout(timerId);
  }, [inactivityTimeoutMs, session, resetInactivityTimer]);

  // ── signOut ───────────────────────────────────────────────────────────────
  async function signOut() {
    explicitSignOutRef.current = true;
    clearInactivityTimer();
    await supabase.auth.signOut();
  }

  const value = {
    session,
    user:          session?.user ?? null,
    profile,
    role:          profile?.roles?.role_name ?? null,
    accountStatus: profile?.account_status ?? null,
    // isLoading is true until both session AND profile are resolved
    isLoading:     session === undefined || (session !== null && profileLoading),
    sessionExpired,
    idleTimeoutMinutes: inactivityTimeoutMs / 60000,
    beginSensitiveContext,
    endSensitiveContext,
    signOut,
    refreshProfile: () =>
      session?.user?.id ? fetchProfile(session.user.id) : Promise.resolve(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {session && showIdleWarning && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="idle-warning-title"
            className="w-full max-w-md rounded-2xl border border-[#DCCDB4] bg-[#FFFEFB] p-6 shadow-2xl"
          >
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#2E7D32]">
              Session security
            </p>
            <h2 id="idle-warning-title" className="text-xl font-bold text-[#4E342E]">
              You will be signed out soon
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#765D52]">
              Your session has been idle. To protect contract, banking, and payment information,
              you will be signed out in <strong>{warningSeconds} seconds</strong>.
            </p>
            <button
              type="button"
              onClick={staySignedIn}
              className="mt-6 w-full rounded-xl bg-[#2E7D32] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#1F6A29] focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:ring-offset-2"
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}