import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const profileRef = useRef(null);

  const fetchProfile = useCallback(async (userId) => {
    setProfileLoading(true);
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
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (session) {
        fetchProfile(session.user.id);
        setSessionExpired(false);
      } else {
        setProfile(null);
        profileRef.current = null;
        // TOKEN_REFRESHED_ERROR or explicit SIGNED_OUT means session is dead
        if (event === "TOKEN_REFRESHED" && !session) {
          setSessionExpired(true);
        }
        if (event === "SIGNED_OUT") {
          setSessionExpired(false); // normal sign-out, handled by navigation in layout
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.roles?.role_name ?? null,
    accountStatus: profile?.account_status ?? null,
    isLoading: session === undefined || (session !== null && profileLoading),
    sessionExpired,
    signOut: () => supabase.auth.signOut(),
    refreshProfile: () => session?.user?.id ? fetchProfile(session.user.id) : Promise.resolve(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
