-- ============================================================
-- Migration 020: Allow Weigher and Lab Staff to read Active contracts
-- ============================================================
-- The original contracts_select policy only allowed supplier and BO.
-- Weighers must read Active contracts to record contractual deliveries.
-- Lab Staff must read Active contracts to link quality results.
-- ============================================================

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    -- Owner and Supplier see all their contracts at any status
    supplier_id = auth.uid()
    OR business_owner_id = auth.uid()
    -- Weigher and Lab Staff see only Active contracts (needed for delivery recording)
    OR (
      public.get_my_role() IN ('Weigher', 'Laboratory Staff')
      AND status = 'Active'
    )
  );
