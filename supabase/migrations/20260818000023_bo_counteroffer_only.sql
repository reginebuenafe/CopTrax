-- ============================================================
-- Migration 023: Restrict initial proposal creation to Suppliers only
-- ============================================================
-- Business rule: only the Supplier initiates price proposals.
-- The Business Owner may only counteroffer (supersedes_proposal_id IS NOT NULL).
-- Previously the proposals_insert policy allowed the BO to insert any row,
-- including initial proposals (supersedes_proposal_id IS NULL).
-- This migration tightens that to enforce the rule at the database level.
-- ============================================================

DROP POLICY IF EXISTS "proposals_insert" ON public.proposal_forms;

CREATE POLICY "proposals_insert" ON public.proposal_forms
  FOR INSERT WITH CHECK (
    -- Suppliers can create initial proposals or counteroffers
    (public.get_my_role() = 'Supplier' AND supplier_id = auth.uid())
    OR
    -- Business Owner can ONLY counteroffer (supersedes_proposal_id must reference
    -- an existing proposal — never an initial fresh proposal)
    (public.get_my_role() = 'Business Owner' AND supersedes_proposal_id IS NOT NULL)
  );
