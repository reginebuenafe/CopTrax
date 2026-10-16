// Test-only entry: render the real chat views with isolated identities and data.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import BOChatLayout from "../src/pages/owner/BOChatLayout";
import SupplierChatLayout from "../src/pages/supplier/SupplierChatLayout";
import NegotiationChatWidget from "../src/components/NegotiationChatWidget";
import { setAiMode, setFixtureConversation } from "../src/lib/supabase";
import "../src/index.css";

const params = new URLSearchParams(location.search);
const view = params.get("view");
const conversationId = params.get("conversation");
localStorage.setItem("coptrax_chat_widget_open", "true");
document.documentElement.dataset.theme = params.get("theme") || "";
const path = `/dashboard/${view === "owner" ? "owner" : "supplier"}/conversations/${conversationId}`;
export function ConversationSwitch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [otherId] = React.useState(() => crypto.randomUUID());
  if (view !== "owner") return null;
  return <button onClick={() => {
    const nextId = location.pathname.endsWith(conversationId) ? otherId : conversationId;
    setFixtureConversation(nextId);
    navigate(`/dashboard/owner/conversations/${nextId}`);
  }}>Switch conversation</button>;
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
  <MemoryRouter initialEntries={[view === "widget" ? "/dashboard/supplier" : path]}>
    <div className="p-2" style={{ height: "100vh" }}>
      <label>AI outcome <select aria-label="AI outcome" onChange={event => setAiMode(event.target.value)}>
        <option value="success">Success</option><option value="error">Error</option><option value="timeout">Timeout</option>
      </select></label>
      <ConversationSwitch />
      {view === "widget" ? <NegotiationChatWidget /> : <Routes>
        <Route path="/dashboard/owner/conversations/:conversationId" element={<BOChatLayout />} />
        <Route path="/dashboard/supplier/conversations/:conversationId" element={<SupplierChatLayout />} />
      </Routes>}
    </div>
  </MemoryRouter>
  </React.StrictMode>,
);
