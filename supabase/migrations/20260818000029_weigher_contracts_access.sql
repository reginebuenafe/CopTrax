-- ============================================================
-- Migration 029: Re-apply contracts policy with Weigher access
-- ============================================================
-- Migration 026 was edited to include Weigher/Lab Staff access,
-- but since 026 was already applied, the edit wasn't re-run.
-- This migration ensures Weigher can read Active contracts.
-- ============================================================

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    supplier_id = auth.uid()
    OR business_owner_id = auth.uid()
    OR public.get_my_role() = 'Business Owner'
    -- Weigher and Lab Staff see only Active contracts (needed for delivery recording)
    OR (
      public.get_my_role() IN ('Weigher', 'Laboratory Staff')
      AND status = 'Active'
    )
  );
