import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const INACTIVITY_WARNING_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

export function AuthProvider({ children }) {
  const [session, setSession]               = useState(undefined); // undefined = loading
  const [profile, setProfile]               = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [warningSeconds, setWarningSeconds] = useState(INACTIVITY_WARNING_MS / 1000);

  const wasAuthenticatedRef  = useRef(false);
  const explicitSignOutRef   = useRef(false);
  const inactivityTimerRef   = useRef(null);
  const inactivityWarningTimerRef = useRef(null);
  const inactivityDeadlineRef = useRef(null);

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
  const clearInactivityTimers = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (inactivityWarningTimerRef.current) {
      clearTimeout(inactivityWarningTimerRef.current);
      inactivityWarningTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimers();
    setShowInactivityWarning(false);
    setWarningSeconds(INACTIVITY_WARNING_MS / 1000);
    inactivityDeadlineRef.current = Date.now() + INACTIVITY_TIMEOUT_MS;

    inactivityWarningTimerRef.current = setTimeout(() => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((inactivityDeadlineRef.current - Date.now()) / 1000),
      );
      setWarningSeconds(secondsLeft);
      setShowInactivityWarning(true);
    }, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS);

    inactivityTimerRef.current = setTimeout(async () => {
      // Only sign out if there is an active session
      if (wasAuthenticatedRef.current) {
        setShowInactivityWarning(false);
        explicitSignOutRef.current = false; // mark as inactivity, not explicit
        await supabase.auth.signOut();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimers]);

  useEffect(() => {
    if (!showInactivityWarning) return undefined;

    const updateCountdown = () => {
      setWarningSeconds(Math.max(
        0,
        Math.ceil((inactivityDeadlineRef.current - Date.now()) / 1000),
      ));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [showInactivityWarning]);

  // ── Auth state ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        wasAuthenticatedRef.current = true;
        fetchProfile(session.user.id);
        resetInactivityTimer();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        wasAuthenticatedRef.current = true;
        setSession(session);
        setSessionExpired(false);
        fetchProfile(session.user.id);
        resetInactivityTimer();
      } else {
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
        clearInactivityTimers();
      }
    });

    return () => {
      subscription.unsubscribe();
      clearInactivityTimers();
    };
  }, [fetchProfile, resetInactivityTimer, clearInactivityTimers]);

  // ── Activity listeners ────────────────────────────────────────────────────
  // Only attach when there is an active session; detach on sign-out
  useEffect(() => {
    if (!session) return;

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, resetInactivityTimer, { passive: true })
    );

    return () => {
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, resetInactivityTimer)
      );
    };
  }, [session, resetInactivityTimer]);

  // ── signOut ───────────────────────────────────────────────────────────────
  async function signOut() {
    explicitSignOutRef.current = true;
    setShowInactivityWarning(false);
    clearInactivityTimers();
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
    signOut,
    refreshProfile: () =>
      session?.user?.id ? fetchProfile(session.user.id) : Promise.resolve(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showInactivityWarning && session && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-warning-title"
            aria-describedby="session-warning-description"
            className="w-full max-w-sm rounded-2xl border border-[#E4D5BD] bg-[#FFFEFB] p-6 text-center shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl font-bold text-amber-700">
              {warningSeconds}
            </div>
            <h2 id="session-warning-title" className="text-lg font-extrabold text-[#3E2723]">
              Your session is about to expire
            </h2>
            <p id="session-warning-description" className="mt-2 text-sm leading-relaxed text-[#8B7355]">
              You will be signed out in {warningSeconds} second{warningSeconds === 1 ? "" : "s"} due to inactivity.
            </p>
            <button
              type="button"
              onClick={resetInactivityTimer}
              className="mt-5 w-full rounded-xl bg-[#17682D] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#105523] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17682D]/40"
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

// AuthProvider and its hook intentionally share this context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
