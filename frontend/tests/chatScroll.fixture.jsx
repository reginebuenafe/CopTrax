import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import NegotiationChatWidget from "../src/components/NegotiationChatWidget";
import SupplierChatLayout from "../src/pages/supplier/SupplierChatLayout";
import BOChatLayout from "../src/pages/owner/BOChatLayout";
import { calls, receiveFixtureMessage, receiveFixtureProposal, supabase } from "./supplierPricing.mock";
import "../src/index.css";

const params = new URLSearchParams(location.search);
const view = params.get("view");
if (params.get("mode") === "long") {
  for (let i = 0; i < 45; i++) receiveFixtureMessage({ sender_id: i % 2 ? "supplier" : "owner", message_text: `Historical message ${i}: enough text to wrap on mobile and exercise the whole thread.` });
} else if (params.get("mode") === "short") {
  receiveFixtureMessage({ message_text: "One short message." });
  receiveFixtureMessage({ sender_id: "supplier", message_text: "One short reply." });
}
localStorage.setItem("coptrax_chat_widget_open", "true");
window.scrollFixture = {
  calls, receiveFixtureMessage, receiveFixtureProposal,
  activity(active, ai = false) {
    const payload = { conversation_id: "pricing-conversation", sender_id: params.get("viewer") === "owner" ? "supplier" : "owner",
      name: "Other participant", session_id: "scroll-test-session", request_id: "scroll-test-request", typing: active, thinking: active };
    for (const channel of supabase.getChannels()) for (const handler of channel.handlers) {
      if (handler.type === "broadcast" && handler.filter.event === (ai ? "ai_thinking" : "typing")) handler.callback({ payload });
    }
  },
};
function FixtureChats() {
  const navigate = useNavigate();
  useEffect(() => { window.scrollFixture.navigate = id => navigate(`/dashboard/${view === "owner" ? "owner" : "supplier"}/conversations/${id}`); }, [navigate]);
  if (view === "widget") return <NegotiationChatWidget />;
  return <div className="flex min-h-screen flex-col"><main className="min-w-0 flex-1 px-3 pb-5 pt-[76px] sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 lg:pt-[84px]">
    <Routes>
      <Route path="/dashboard/supplier/conversations/:conversationId" element={<SupplierChatLayout />} />
      <Route path="/dashboard/owner/conversations/:conversationId" element={<BOChatLayout />} />
    </Routes>
  </main></div>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><MemoryRouter initialEntries={[`/dashboard/${view === "owner" ? "owner" : "supplier"}/conversations/pricing-conversation`]}><FixtureChats /></MemoryRouter></React.StrictMode>);
