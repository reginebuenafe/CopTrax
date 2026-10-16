import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NegotiationChatWidget from "../src/components/NegotiationChatWidget";
import SupplierChatLayout from "../src/pages/supplier/SupplierChatLayout";
import SupplierOverview from "../src/pages/supplier/SupplierOverview";
import BOChatLayout from "../src/pages/owner/BOChatLayout";
import ProposePriceModal from "../src/components/ProposePriceModal";
import { calls, setContractHistory, receiveFixtureMessage, receiveFixtureProposal } from "./supplierPricing.mock";
import "../src/index.css";
const params = new URLSearchParams(location.search);
const view = params.get("view");
localStorage.setItem("coptrax_chat_widget_open", "true");
if (params.has("saved")) sessionStorage.setItem(`coptrax:proposal-modal:${view === "widget" ? "widget" : "supplier-chat"}:supplier`, JSON.stringify({ type: params.get("saved"), conversationId: "pricing-conversation", proposal: { proposal_id: "offer" } }));
// Expose only fixture controls, never live application credentials or data.
window.pricingFixture = { calls, setContractHistory, receiveFixtureMessage, receiveFixtureProposal };
createRoot(document.getElementById("root")).render(<React.StrictMode><MemoryRouter initialEntries={[`/dashboard/${view === "owner" ? "owner" : "supplier"}/conversations/pricing-conversation`]}>
  {view === "widget" ? <NegotiationChatWidget /> : view === "overview" ? <><SupplierOverview /><NegotiationChatWidget /></> : view === "modal" ? <ProposePriceModal conversationId="pricing-conversation" userId={params.get("viewer") || "supplier"} supplierId="supplier" isCounter={!params.has("initial")} supersedesId={params.has("initial") ? null : "offer"} initialPrice={50} initialVolume={2} onClose={() => {}} onSubmitted={() => {}} /> : <Routes>
    <Route path="/dashboard/supplier/conversations/:conversationId" element={<SupplierChatLayout />} />
    <Route path="/dashboard/owner/conversations/:conversationId" element={<BOChatLayout />} />
  </Routes>}
</MemoryRouter></React.StrictMode>);
