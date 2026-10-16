const key = userId => `coptrax:session-end:${userId}`;
export function rememberSessionEnd(userId, reason) {
  try { localStorage.setItem(key(userId), JSON.stringify({ reason, at: Date.now() })); } catch { /* Optional cross-tab explanation. */ }
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

export async function logoutWithRetry(auth, accessToken, scope) {
  const { error } = await auth.signOut({ scope });
  // The SDK clears its local session even when the revoke request fails.
  // Retry with the captured token rather than calling signOut with no session.
  if (error && accessToken) {
    const retry = await auth.admin.signOut(accessToken, scope);
    if (retry.error) console.warn("Server sign-out could not be confirmed; local sign-out completed.");
  }
}
