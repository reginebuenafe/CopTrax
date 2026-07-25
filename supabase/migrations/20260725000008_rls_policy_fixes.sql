-- ============================================================
-- Migration 008: RLS Policy Fixes
-- Corrects three access-control gaps that caused silent insert failures.
-- ============================================================

-- ------------------------------------------------------------
-- 1. INVENTORY_BATCHES: allow Laboratory Staff to insert.
--    When the lab accepts a contractual delivery, InspectionQueuePage
--    inserts a Resecada batch. The previous policy only permitted
--    Business Owner and Weigher, so the insert silently failed under RLS.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "inventory_batches_insert" ON public.inventory_batches;

CREATE POLICY "inventory_batches_insert" ON public.inventory_batches
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('Business Owner', 'Weigher', 'Laboratory Staff')
  );

-- Also let Laboratory Staff read batches (parity with their insert path).
DROP POLICY IF EXISTS "inventory_batches_select" ON public.inventory_batches;

CREATE POLICY "inventory_batches_select" ON public.inventory_batches
  FOR SELECT USING (
    public.get_my_role() IN ('Business Owner', 'Weigher', 'Laboratory Staff')
  );

-- ------------------------------------------------------------
-- 2. CONTRACT_SIGNATURES: allow the Business Owner to insert a
--    signature row on behalf of the supplier (auto-applied signature).
--    The old policy required signer_id = auth.uid(), which blocked the
--    BO from inserting the supplier's signature row on activation.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "contract_signatures_insert" ON public.contract_signatures;

CREATE POLICY "contract_signatures_insert" ON public.contract_signatures
  FOR INSERT WITH CHECK (
    -- a signer inserting their own signature
    signer_id = auth.uid()
    -- or the Business Owner inserting any signature for a contract they own
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.contract_id = contract_signatures.contract_id
        AND c.business_owner_id = auth.uid()
        AND public.get_my_role() = 'Business Owner'
    )
  );

-- ------------------------------------------------------------
-- 3. NOTIFICATIONS: add an INSERT policy.
--    Notifications are created by many roles for OTHER users
--    (BO → Supplier, Lab → Supplier, etc.), so there was no valid
--    row-owner check and every client-side insert failed under RLS.
--    Allow any authenticated user to create notifications.
-- ------------------------------------------------------------
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
