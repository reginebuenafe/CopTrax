// Local auth service stub. The real AuthProvider and idle controller are used.
const initial = { user: { id: "session-user", email: "session@example.test" }, access_token: "fixture-token" };
if (!localStorage.getItem("fixture-auth")) localStorage.setItem("fixture-auth", JSON.stringify(initial));
let current = JSON.parse(localStorage.getItem("fixture-auth"));
const listeners = new Set(), channels = new Set();
let profile = { user_id: "session-user", account_status: "Active", first_name: "Session", roles: { role_name: "Supplier" } };
export const calls = [];
export const controls = {
  delay: 0, failLogout: false,
  emit(event, session = current) { current = session; for (const callback of listeners) callback(event, session); },
  profile(changes) {
    profile = { ...profile, ...changes };
    for (const channel of channels) for (const fn of channel.handlers) fn({ new: profile });
  },
};
window.addEventListener("storage", event => {
  if (event.key === "fixture-auth") controls.emit(JSON.parse(event.newValue) ? "SIGNED_IN" : "SIGNED_OUT", JSON.parse(event.newValue));
});
export const supabase = {
  auth: {
    onAuthStateChange(callback) {
      listeners.add(callback);
      queueMicrotask(() => { if (listeners.has(callback)) callback("INITIAL_SESSION", current); });
      return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
    },
    async signOut(options) {
      calls.push({ action: "signOut", at: Date.now(), ...options });
      localStorage.setItem("fixture-auth", "null"); controls.emit("SIGNED_OUT", null);
      return { error: controls.failLogout ? Error("Fixture network failure") : null };
    },
    admin: { async signOut(token, scope) { calls.push({ action: "retry", token, scope }); return { error: null }; } },
  },
  from() { return { select() { return this; }, eq() { return this; }, async single() {
    const snapshot = structuredClone(profile), delay = controls.delay;
    calls.push({ action: "profile" });
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return { data: snapshot, error: null };
  } }; },
  channel() {
    const channel = { handlers: [], on(_type, _filter, fn) { this.handlers.push(fn); return this; }, subscribe() { channels.add(this); return this; } };
    return channel;
  },
  removeChannel(channel) { channels.delete(channel); },
};
