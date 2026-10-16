import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { createSessionIdle, DEFAULT_IDLE_MS, SENSITIVE_IDLE_MS } from "../utils/sessionIdle";
import { logoutWithRetry, rememberSessionEnd, readSessionEnd, clearSessionEnd } from "../utils/sessionLogout";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]               = useState(undefined); // undefined = loading
  const [profile, setProfile]               = useState(null);
  // Start as true: keeps isLoading=true until the first auth event resolves,
  // preventing a race window where session is set but profileLoading is still false.
  const [profileLoading, setProfileLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionEndReason, setSessionEndReason] = useState(null);
  const [sensitiveContextCount, setSensitiveContextCount] = useState(0);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [warningSeconds, setWarningSeconds] = useState(60);

  const wasAuthenticatedRef = useRef(false);
  const loadedUserIdRef = useRef(null);
  const sessionRef = useRef(null);
  const idleRef = useRef(null);
  const endReasonRef = useRef(null);
  const mountedRef = useRef(false);
  const profileVersionRef = useRef(0);
  const inactivityTimeoutMsRef = useRef(DEFAULT_IDLE_MS);
  const inactivityTimeoutMs = sensitiveContextCount > 0 ? SENSITIVE_IDLE_MS : DEFAULT_IDLE_MS;
  const invalidateProfile = useCallback(() => { profileVersionRef.current++; }, []);

  useEffect(() => {
    inactivityTimeoutMsRef.current = inactivityTimeoutMs;
    idleRef.current?.setTimeoutMs(inactivityTimeoutMs);
  }, [inactivityTimeoutMs]);

  const fetchProfile = useCallback(async (userId, { silent = false } = {}) => {
    // `silent` updates `profile` without touching `profileLoading` (and
    // therefore the global `isLoading` flag). ProtectedRoute unmounts its
    // entire children tree while `isLoading` is true (see the comment
    // below about the auth-event path), which would wipe any in-progress
    // local component state — including a just-set success/error toast —
    // on every call to the public `refreshProfile()`. The initial/auth-
    // event-driven load below still needs the real gating behavior, so
    // only `refreshProfile()` opts into `silent`.
    const version = ++profileVersionRef.current;
    const isCurrent = () => mountedRef.current && !endReasonRef.current && version === profileVersionRef.current && sessionRef.current?.user.id === userId;
    let timeoutId;
    if (!silent) setProfileLoading(true);
    try {
      // Race against a 10-second timeout so a stalled network never blocks login
      const timeout = new Promise((_, reject) =>
        timeoutId = setTimeout(() => reject(new Error("Profile fetch timed out")), 10_000)
      );
      const query = supabase
        .from("users")
        .select("*, roles(role_name)")
        .eq("user_id", userId)
        .single();
      const { data, error } = await Promise.race([query, timeout]);
      if (error) console.error("fetchProfile error:", error.message);
      if (isCurrent()) setProfile(data ?? null);
    } catch (err) {
      console.error("fetchProfile failed:", err?.message ?? err);
      if (isCurrent()) setProfile(null);
    } finally {
      clearTimeout(timeoutId);
      if (isCurrent()) setProfileLoading(false);
    }
  }, []);

  const endSession = useCallback(async (reason = "manual", scope = "global") => {
    const current = sessionRef.current;
    if (!current) return;
    endReasonRef.current = reason;
    rememberSessionEnd(current.user.id, reason);
    idleRef.current?.stop();
    invalidateProfile();
    setSessionExpired(reason === "idle");
    setSessionEndReason(reason);
    setSession(null);
    setProfile(null);
    setProfileLoading(false);
    setShowIdleWarning(false);
    try {
      await logoutWithRetry(supabase.auth, current.access_token, scope);
    } catch {
      console.warn("Server sign-out could not be confirmed.");
    }
  }, [invalidateProfile]);
  const staySignedIn = useCallback(() => idleRef.current?.staySignedIn(), []);

  const beginSensitiveContext = useCallback(() => {
    setSensitiveContextCount((count) => count + 1);
  }, []);

  const endSensitiveContext = useCallback(() => {
    setSensitiveContextCount((count) => Math.max(0, count - 1));
  }, []);

  // Restore the stored deadline; token refresh is not user activity.
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (nextSession) {
        if (endReasonRef.current) return;
        const userId = nextSession.user.id;
        const changedUser = loadedUserIdRef.current !== userId;
        sessionRef.current = nextSession;
        wasAuthenticatedRef.current = true;
        endReasonRef.current = null;
        setSession(nextSession);
        setSessionExpired(false);
        setSessionEndReason(null);
        if (changedUser) {
          loadedUserIdRef.current = userId;
          clearSessionEnd(userId);
          fetchProfile(userId);
        } else if (["INITIAL_SESSION", "TOKEN_REFRESHED", "USER_UPDATED", "SIGNED_IN"].includes(event)) {
          fetchProfile(userId, { silent: true });
        }
        if (idleRef.current?.userId !== userId) {
          idleRef.current?.stop();
          const idle = createSessionIdle({
            userId, timeoutMs: inactivityTimeoutMsRef.current,
            onWarning: ({ show, seconds }) => { if (active) { setShowIdleWarning(show); setWarningSeconds(seconds); } },
            onExpire: () => queueMicrotask(() => {
              if (active && idleRef.current === idle) endSession("idle", "local");
            }),
          });
          idleRef.current = idle;
          idle.start();
        } else idleRef.current.check();
      } else {
        const userId = loadedUserIdRef.current;
        const reason = endReasonRef.current || (userId && readSessionEnd(userId)) || "expired";
        if (event === "SIGNED_OUT") {
          setSessionExpired(wasAuthenticatedRef.current && reason !== "manual");
          setSessionEndReason(wasAuthenticatedRef.current ? reason : null);
        }
        idleRef.current?.clear();
        idleRef.current = null;
        sessionRef.current = null;
        wasAuthenticatedRef.current = false;
        endReasonRef.current = null;
        loadedUserIdRef.current = null;
        invalidateProfile();
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
        setShowIdleWarning(false);
      }
    });
    return () => {
      active = false;
      mountedRef.current = false;
      invalidateProfile();
      subscription.unsubscribe();
      idleRef.current?.stop();
      idleRef.current = null;
    };
  }, [fetchProfile, endSession, invalidateProfile]);

  // Refresh authorization data without unmounting forms on focus or row changes.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return undefined;
    const refresh = () => { if (!document.hidden) fetchProfile(userId, { silent: true }); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const channel = supabase.channel(`auth-profile:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchProfile]);

  const signOut = useCallback(() => endSession("manual", "global"), [endSession]);

  const value = {
    session,
    user:          session?.user ?? null,
    profile,
    role:          profile?.roles?.role_name ?? null,
    accountStatus: profile?.account_status ?? null,
    // isLoading is true until both session AND profile are resolved
    isLoading:     session === undefined || (session !== null && profileLoading),
    sessionExpired,
    sessionEndReason,
    idleTimeoutMinutes: inactivityTimeoutMs / 60000,
    beginSensitiveContext,
    endSensitiveContext,
    signOut,
    refreshProfile: () =>
      session?.user?.id ? fetchProfile(session.user.id, { silent: true }) : Promise.resolve(),
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

// Keep the hook beside its provider so existing imports remain stable.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
