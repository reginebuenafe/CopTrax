import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { useSensitiveSessionTimeout } from "../src/hooks/useSensitiveSessionTimeout";
import ProtectedRoute from "../src/components/ProtectedRoute";
import LoginPage from "../src/pages/auth/LoginPage";
import { calls, controls } from "./session.mock";
import "../src/index.css";

window.sessionFixture = { calls, controls };
function Probe() {
  const { session, isLoading, sessionExpired, sessionEndReason, idleTimeoutMinutes, signOut, accountStatus } = useAuth();
  const [scrolls, setScrolls] = useState(0);
  const [sensitive, setSensitive] = useState(new URLSearchParams(location.search).has("sensitive"));
  useSensitiveSessionTimeout(sensitive);
  return <>
    <p data-testid="auth-state">{isLoading ? "loading" : session ? "signed-in" : sessionExpired ? "expired" : "signed-out"}</p>
    <p data-testid="idle-minutes">{idleTimeoutMinutes}</p><p data-testid="end-reason">{sessionEndReason}</p>
    <p data-testid="account-status">{accountStatus}</p><p data-testid="scroll-count">{scrolls}</p>
    <input aria-label="Activity input" />
    <button onClick={signOut}>Manual logout</button>
    <button onClick={() => setSensitive(value => !value)}>Toggle sensitive context</button>
    <div data-testid="inner-scroll" style={{ height: 160, overflowY: "auto" }} onScroll={() => setScrolls(count => count + 1)}>
      <div style={{ height: 1800 }}>Local chat scroll fixture</div>
    </div>
    <MemoryRouter initialEntries={["/dashboard/supplier"]}><Routes>
      <Route path="/dashboard/supplier" element={<ProtectedRoute allowedRoles={["Supplier"]}><><p>Protected view</p><input aria-label="Protected draft" /></></ProtectedRoute>} />
      <Route path="/login" element={<LoginPage />} /><Route path="/pending-approval" element={<p>Pending approval</p>} />
      <Route path="/unauthorized" element={<p>Unauthorized</p>} />
    </Routes></MemoryRouter>
  </>;
}
function Shell() {
  const [generation, setGeneration] = useState(0);
  return <><button onClick={() => setGeneration(value => value + 1)}>Remount auth provider</button>
    <AuthProvider key={generation}><Probe /></AuthProvider></>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><Shell /></React.StrictMode>);
