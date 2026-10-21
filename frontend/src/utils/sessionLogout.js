const key = userId => `coptrax:session-end:${userId}`;
export function rememberSessionEnd(userId, reason) {
  try { 
    localStorage.setItem(key(userId), JSON.stringify({ reason, at: Date.now() })); 
    // For manual logout, also set a "do not restore" flag that survives across sessions
    if (reason === "manual") {
      localStorage.setItem("coptrax:explicit-logout", JSON.stringify({ at: Date.now() }));
    }
  } catch { /* Optional cross-tab explanation. */ }
}
export function readSessionEnd(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)));
    return ["idle", "manual"].includes(saved?.reason) && Date.now() - saved.at < 60_000 ? saved.reason : null;
  } catch { return null; }
}
export function clearSessionEnd(userId) {
  try { localStorage.removeItem(key(userId)); } catch { /* Storage may be unavailable. */ }
}

export function hasExplicitLogoutRecently() {
  try {
    const saved = JSON.parse(localStorage.getItem("coptrax:explicit-logout"));
    // Consider logout recent if it happened within the last 5 minutes
    return saved && Date.now() - saved.at < 5 * 60 * 1000;
  } catch { return false; }
}

export function clearExplicitLogout() {
  try { localStorage.removeItem("coptrax:explicit-logout"); } catch { /* Storage may be unavailable. */ }
}

export async function logoutWithRetry(auth, accessToken, scope) {
  // Clear Supabase's persistent session storage to prevent automatic session restoration
  // on the next app load. This is needed because signOut() may not fully clear storage
  // in all cases, and Supabase's onAuthStateChange listener will restore persisted sessions.
  if (typeof window !== "undefined") {
    try {
      // Clear localStorage keys that Supabase uses for session persistence
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes("sb-") || key.includes("supabase") || key.includes("auth"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (err) {
      console.warn("Could not clear session storage:", err);
    }
  }

  const { error } = await auth.signOut({ scope });
  // The SDK clears its local session even when the revoke request fails.
  // Retry with the captured token rather than calling signOut with no session.
  if (error && accessToken) {
    const retry = await auth.admin.signOut(accessToken, scope);
    if (retry.error) console.warn("Server sign-out could not be confirmed; local sign-out completed.");
  }
}
