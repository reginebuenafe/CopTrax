import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

export function AuthProvider({ children }) {
<<<<<<< HEAD
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
=======
  const [session, setSession]               = useState(undefined); // undefined = loading
  const [profile, setProfile]               = useState(null);
>>>>>>> origin/main
  const [profileLoading, setProfileLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const wasAuthenticatedRef  = useRef(false);
  const explicitSignOutRef   = useRef(false);
  const inactivityTimerRef   = useRef(null);

  const fetchProfile = useCallback(async (userId) => {
    setProfileLoading(true);
<<<<<<< HEAD
    try {
      const { data } = await supabase
        .from("users")
        .select("*, roles(role_name)")
        .eq("user_id", userId)
        .single();
      setProfile(data);
      profileRef.current = data;
    } finally {
      setProfileLoading(false);
    }
=======
    const { data } = await supabase
      .from("users")
      .select("*, roles(role_name)")
      .eq("user_id", userId)
      .single();
    setProfile(data);
    setProfileLoading(false);
>>>>>>> origin/main
  }, []);

  // ── Inactivity timer ──────────────────────────────────────────────────────
  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(async () => {
      // Only sign out if there is an active session
      if (wasAuthenticatedRef.current) {
        explicitSignOutRef.current = false; // mark as inactivity, not explicit
        await supabase.auth.signOut();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer]);

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
    clearInactivityTimer();
    await supabase.auth.signOut();
  }

  const value = {
    session,
    user:          session?.user ?? null,
    profile,
    role:          profile?.roles?.role_name ?? null,
    accountStatus: profile?.account_status ?? null,
<<<<<<< HEAD
    isLoading: session === undefined || (session !== null && profileLoading),
=======
    // isLoading is true until both session AND profile are resolved
    isLoading:     session === undefined || (session !== null && profileLoading),
>>>>>>> origin/main
    sessionExpired,
    signOut,
    refreshProfile: () =>
      session?.user?.id ? fetchProfile(session.user.id) : Promise.resolve(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
