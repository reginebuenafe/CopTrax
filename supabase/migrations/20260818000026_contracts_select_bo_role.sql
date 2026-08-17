-- ============================================================
-- Migration 026: Fix contracts_select so Business Owner sees all contracts
-- ============================================================
-- The original policy used ONLY:
--   supplier_id = auth.uid() OR business_owner_id = auth.uid()
-- Every other BO-visible policy in the system uses get_my_role().
-- If business_owner_id ever mismatches auth.uid() (e.g. seeded BO account,
-- contract inserted via a different path), the BO sees 0 contracts.
-- Adding OR get_my_role() = 'Business Owner' makes it consistent and
-- ensures the BO always sees all contracts in NERC Copra Trading.
-- ============================================================

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    supplier_id = auth.uid()
    OR business_owner_id = auth.uid()
    OR public.get_my_role() = 'Business Owner'
  );
