-- ============================================================
-- Migration 024: Cap supplier proposals at 3 Active contracts
-- ============================================================
-- A Supplier may hold at most 3 Active contracts simultaneously.
-- If they already have 3, the proposals_insert policy rejects
-- any new initial proposal (supersedes_proposal_id IS NULL)
-- directly at the database level.
-- Counteroffers (supersedes_proposal_id IS NOT NULL) are
-- unaffected by this cap — the BO can still counteroffer freely
-- and the Supplier can counter back.
-- ============================================================

DROP POLICY IF EXISTS "proposals_insert" ON public.proposal_forms;

CREATE POLICY "proposals_insert" ON public.proposal_forms
  FOR INSERT WITH CHECK (
    -- Supplier: initial proposal allowed only when they have < 3 Active contracts.
    -- Counteroffers (supersedes_proposal_id IS NOT NULL) are always allowed.
    (
      public.get_my_role() = 'Supplier'
      AND supplier_id = auth.uid()
      AND (
        supersedes_proposal_id IS NOT NULL
        OR (
          SELECT COUNT(*)
          FROM public.contracts c
          WHERE c.supplier_id = auth.uid()
            AND c.status = 'Active'
        ) < 3
      )
    )
    OR
    -- Business Owner: counteroffers only (initial proposals blocked at DB level).
    (
      public.get_my_role() = 'Business Owner'
      AND supersedes_proposal_id IS NOT NULL
    )
  );
