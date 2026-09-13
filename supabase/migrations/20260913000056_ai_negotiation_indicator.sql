-- ============================================================
-- Migration 056: AI negotiation indicator
--
-- Adds a minimal, additive `is_ai_generated` boolean flag to `messages`
-- and `proposal_forms`, set ONLY by the `ai-negotiate` Edge Function
-- (auto-accept / auto-counteroffer on the Business Owner's behalf while
-- the global AI auto-negotiate toggle is on). Human Business Owner actions
-- (BOChatLayout, generate-contract, sign-contract) never set this flag —
-- it defaults to FALSE everywhere else.
--
-- Purpose: lets the Supplier-facing chat UI (SupplierChatLayout,
-- NegotiationChatWidget) clearly label AI-authored counteroffers/messages
-- as coming from an "AI Negotiator" rather than implying a human Business
-- Owner responded. This is purely an additive display flag — it does not
-- change any negotiation decision, acceptance, rejection, or contract
-- generation logic in any way.
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.proposal_forms
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE;
