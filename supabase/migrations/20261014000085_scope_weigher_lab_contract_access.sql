-- BUG-17 fix: migration 020 granted Weigher and Laboratory Staff SELECT on
-- EVERY Active contract system-wide (all columns, including negotiated
-- price/volume/notes), far broader than what their actual delivery-entry
-- or inspection tasks use.
--
-- Verified against the actual frontend before changing anything:
--   - Weigher pages (ContractualDeliveryForm.jsx, WeigherHistoryPage.jsx)
--     never query the contracts table directly or via embed at all — all
--     contract-aware allocation logic runs server-side inside the
--     SECURITY DEFINER record_contractual_delivery() RPC, which already
--     bypasses RLS. Weigher needs zero direct contracts access.
--   - Laboratory Staff only ever reads contracts via a
--     contract:contract_id(contract_number) embed on deliveries in their
--     Weighed inspection queue (InspectionQueuePage.jsx, including
--     multi-contract cascade splits via delivery_allocations) or on their
--     own past inspections (LabHistoryPage.jsx) — never any Active
--     contract regardless of relevance.
--
-- This narrows the ROW set Weigher/Laboratory Staff can see (removing
-- Weigher entirely, scoping Laboratory Staff to contracts actually tied
-- to a delivery they're inspecting or have inspected) without changing
-- any other role's access, any column, or any existing query path.

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    -- Owner and Supplier see all their contracts at any status
    supplier_id = auth.uid()
    OR business_owner_id = auth.uid()
    -- Laboratory Staff: only Active contracts actually referenced (directly
    -- or via a cascade-split allocation) by a delivery currently in their
    -- Weighed inspection queue, or by a delivery they have personally
    -- inspected — never the full set of Active contracts.
    OR (
      public.get_my_role() = 'Laboratory Staff'
      AND status = 'Active'
      AND EXISTS (
        SELECT 1
        FROM public.delivery_allocations da
        JOIN public.deliveries d ON d.delivery_id = da.delivery_id
        WHERE da.contract_id = contracts.contract_id
          AND (
            d.delivery_status = 'Weighed'
            OR EXISTS (
              SELECT 1 FROM public.laboratory_inspections li
              WHERE li.delivery_id = d.delivery_id AND li.lab_staff_id = auth.uid()
            )
          )
      )
    )
  );
