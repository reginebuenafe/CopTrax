-- ============================================================
-- Migration 054: Fix duplicate supplier_performance_snapshot rows
--
-- Root cause: auto_breach_overdue_contracts() both (1) UPDATEs
-- contracts.status to 'Breached' — which fires the existing
-- on_contract_status_change trigger and calls
-- compute_supplier_rating() — AND (2) explicitly PERFORMs
-- compute_supplier_rating() again right after. That produced two
-- identical snapshot rows per breached contract (visible as
-- duplicate "CTR-00002" cards on the Supplier "My Rating" page).
--
-- This migration:
--   1. Removes the redundant explicit call so the trigger is the
--      single source of truth (same pattern already used when a
--      contract is auto-marked 'Completed' via delivery_allocations).
--   2. De-duplicates any existing duplicate snapshot rows, keeping
--      the earliest row per contract_id.
--   3. Adds a partial unique index on contract_id so this class of
--      duplicate can never be reintroduced.
--   4. Recomputes overall_supplier_rating as the correct running
--      average per supplier now that duplicates are removed.
-- ============================================================

-- 1. Recreate auto_breach_overdue_contracts() without the duplicate call.
CREATE OR REPLACE FUNCTION public.auto_breach_overdue_contracts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract    RECORD;
  v_delivered_kg DECIMAL;
BEGIN
  FOR v_contract IN
    SELECT c.contract_id, c.contract_number,
           c.supplier_id, c.business_owner_id,
           c.contracted_tons
    FROM public.contracts c
    WHERE c.status = 'Active'
      AND c.due_date < CURRENT_DATE
  LOOP
    -- Sum all accepted allocation weights for this contract
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO v_delivered_kg
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = v_contract.contract_id
      AND d.delivery_status = 'Accepted';

    -- Only breach if quantity not fully delivered
    IF v_delivered_kg < v_contract.contracted_tons * 1000 THEN
      UPDATE public.contracts
      SET status = 'Breached'
      WHERE contract_id = v_contract.contract_id;
      -- NOTE: compute_supplier_rating() is intentionally NOT called
      -- here anymore — the on_contract_status_change trigger (fired
      -- by the UPDATE above) already computes it exactly once.

      -- Notify supplier
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.supplier_id,
        'Contract Breached',
        'Contract ' || v_contract.contract_number ||
          ' has been marked as Breached because the delivery deadline passed without full fulfillment.',
        'contracts',
        v_contract.contract_id
      );

      -- Notify business owner
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.business_owner_id,
        'Contract Breached',
        'Contract ' || v_contract.contract_number ||
          ' has been automatically marked as Breached. The delivery deadline passed without full fulfillment.',
        'contracts',
        v_contract.contract_id
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_breach_overdue_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_breach_overdue_contracts() TO anon;

-- 2. De-duplicate existing snapshot rows: keep only the earliest
--    row (by snapshot_date, then snapshot_id) per contract_id.
DELETE FROM public.supplier_performance_snapshot sps
WHERE sps.contract_id IS NOT NULL
  AND sps.snapshot_id NOT IN (
    SELECT DISTINCT ON (contract_id) snapshot_id
    FROM public.supplier_performance_snapshot
    WHERE contract_id IS NOT NULL
    ORDER BY contract_id, snapshot_date ASC, snapshot_id ASC
  );

-- 3. Prevent this duplicate class from ever reoccurring.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_performance_snapshot_contract_unique
  ON public.supplier_performance_snapshot (contract_id)
  WHERE contract_id IS NOT NULL;

-- 4. Recompute overall_supplier_rating as the correct running
--    (cumulative) average per supplier, now that duplicates are gone.
WITH ranked AS (
  SELECT
    snapshot_id,
    ROUND(
      AVG(supplier_rating) OVER (
        PARTITION BY supplier_id
        ORDER BY snapshot_date ASC, snapshot_id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ), 2
    ) AS running_avg
  FROM public.supplier_performance_snapshot
)
UPDATE public.supplier_performance_snapshot sps
SET overall_supplier_rating = ranked.running_avg
FROM ranked
WHERE sps.snapshot_id = ranked.snapshot_id;
