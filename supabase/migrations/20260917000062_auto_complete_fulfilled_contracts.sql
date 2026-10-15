-- ============================================================
-- Migration 062: Auto-complete fully-delivered Active contracts
--
-- Root cause: trigger_check_contract_completion (migration 009) only
-- fires on an UPDATE of deliveries.delivery_status transitioning TO
-- 'Accepted'. That correctly completes a contract the moment the
-- delivery that pushes it to 100% is accepted by Lab. But there was
-- no reconciliation safety-net for contracts that reach the fully
-- delivered quantity without that exact UPDATE transition being
-- observed (e.g. legacy/backfilled/seeded delivery rows) — unlike
-- auto_breach_overdue_contracts(), which already re-checks breach
-- eligibility on every contracts-page load. Those contracts were
-- stuck showing 100% progress while still "Active" (e.g. CTR-00004).
--
-- This adds the equivalent reconciliation function for completion,
-- called by the frontend alongside auto_breach_overdue_contracts()
-- so any Active contract whose accepted delivered quantity has
-- already reached (or exceeded) the agreed quantity is immediately
-- flipped to Completed — run BEFORE the breach check so full
-- delivery takes priority over an overdue deadline, matching the
-- documented rule ("auto-Breached when deadline passes before
-- [completion]").
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_complete_fulfilled_contracts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract     RECORD;
  v_delivered_kg DECIMAL;
BEGIN
  FOR v_contract IN
    SELECT c.contract_id, c.contract_number,
           c.supplier_id, c.business_owner_id,
           c.contracted_tons
    FROM public.contracts c
    WHERE c.status = 'Active'
  LOOP
    -- Sum all accepted allocation weights for this contract
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO v_delivered_kg
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = v_contract.contract_id
      AND d.delivery_status = 'Accepted';

    IF v_delivered_kg >= v_contract.contracted_tons * 1000 THEN
      UPDATE public.contracts
      SET status = 'Completed'
      WHERE contract_id = v_contract.contract_id;

      -- Notify supplier
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.supplier_id,
        'Contract Completed',
        'Contract ' || v_contract.contract_number ||
          ' has been fully delivered and marked as Completed.',
        'contracts',
        v_contract.contract_id
      );

      -- Notify business owner
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.business_owner_id,
        'Contract Completed',
        'Contract ' || v_contract.contract_number ||
          ' has been fully delivered by the supplier and is now Completed.',
        'contracts',
        v_contract.contract_id
      );
    END IF;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users (frontend calls via anon/service role RPC),
-- matching auto_breach_overdue_contracts()'s existing grants.
GRANT EXECUTE ON FUNCTION public.auto_complete_fulfilled_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_complete_fulfilled_contracts() TO anon;
