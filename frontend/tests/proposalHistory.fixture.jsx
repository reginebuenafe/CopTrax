import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import NegotiationChatWidget from "../src/components/NegotiationChatWidget";
import SupplierChatLayout from "../src/pages/supplier/SupplierChatLayout";
import BOChatLayout from "../src/pages/owner/BOChatLayout";
import { calls, receiveFixtureMessage, receiveFixtureProposal, updateFixtureProposal } from "./supplierPricing.mock";
import "../src/index.css";

// This test route uses only local fixture data, including its realtime updates.
const initial = receiveFixtureProposal({ proposal_id: "initial", submitted_by: "supplier", supersedes_proposal_id: null, proposed_price_per_kg: 30, proposed_volume_tons: 1, proposal_status: "Modified" });
receiveFixtureMessage({ sender_id: "supplier", message_text: "💰 Price proposal: ₱30.00/kg for 1 tons" });
receiveFixtureMessage({ message_text: "A normal message between offers." });
receiveFixtureProposal({ proposal_id: "counter", supersedes_proposal_id: initial, proposed_price_per_kg: 31, proposed_volume_tons: 2, proposal_status: "Rejected" });
receiveFixtureMessage({ message_text: "🔄 Counteroffer: ₱31.00/kg for 2 tons" });
receiveFixtureMessage({ sender_id: "supplier", message_text: "❌ Counteroffer declined." });
// Duplicate legacy representation of the same rejection must not add a line.
receiveFixtureMessage({ sender_id: "supplier", message_text: "Counteroffer rejected: ₱31.00/kg for 2 tons." });
receiveFixtureProposal({ proposal_id: "accepted", submitted_by: "supplier", supersedes_proposal_id: null, proposed_price_per_kg: 32, proposed_volume_tons: 2, proposal_status: "Accepted" });
receiveFixtureMessage({ sender_id: "supplier", message_text: "💰 Price proposal: ₱32.00/kg for 2 tons" });
receiveFixtureMessage({ message_type: "Contract Form", message_text: "You accepted Juan's proposal form.\nPrice: ₱32/kg  Volume: 2 tons" });
receiveFixtureMessage({ is_ai_generated: true, message_text: "An unchanged assistant response." });
receiveFixtureProposal({ proposal_id: "pending", submitted_by: "supplier", supersedes_proposal_id: null, proposed_price_per_kg: 33, proposed_volume_tons: 2 });
receiveFixtureMessage({ sender_id: "supplier", message_text: "💰 Price proposal: ₱33.00/kg for 2 tons" });
window.proposalFixture = {
  resolvePending(status) { updateFixtureProposal("pending", { proposal_status: status }); },
};
window.pricingFixture = { calls, receiveFixtureMessage, receiveFixtureProposal };
const view = new URLSearchParams(location.search).get("view");
localStorage.setItem("coptrax_chat_widget_open", "true");
function FixtureChats() {
  const navigate = useNavigate();
  useEffect(() => { window.proposalFixture.navigate = id => navigate(`/dashboard/${view === "owner" ? "owner" : "supplier"}/conversations/${id}`); }, [navigate]);
  return view === "widget" ? <NegotiationChatWidget /> : <Routes>
    <Route path="/dashboard/supplier/conversations/:conversationId" element={<SupplierChatLayout />} />
    <Route path="/dashboard/owner/conversations/:conversationId" element={<BOChatLayout />} />
  </Routes>;
}
createRoot(document.getElementById("root")).render(<React.StrictMode><MemoryRouter initialEntries={[`/dashboard/${view === "owner" ? "owner" : "supplier"}/conversations/pricing-conversation`]}><FixtureChats /></MemoryRouter></React.StrictMode>);
