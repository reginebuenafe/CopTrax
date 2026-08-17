-- ============================================================
-- Migration 025: Add submitted_by to proposal_forms
-- ============================================================
-- The previous index-based logic (even index = supplier,
-- odd index = BO) for determining who submitted a proposal
-- breaks when there are rejections, re-proposals, or any
-- deviation from perfect alternation.
-- Adding submitted_by as the authoritative record of who
-- created each proposal row (Supplier or Business Owner).
-- ============================================================

ALTER TABLE public.proposal_forms
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(user_id);
