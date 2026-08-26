-- ============================================================
-- Migration 032: Auto-breach overdue contracts
-- Creates a callable function that marks Active contracts as
-- Breached when their due_date has passed and the agreed
-- quantity has not been fully delivered.
-- Called by the frontend on contracts page load (both BO and
-- Supplier) so the breach is immediate rather than waiting for
-- the daily pg_cron window.
-- ============================================================

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

      -- Compute supplier rating
      PERFORM public.compute_supplier_rating(v_contract.contract_id);

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

-- Grant execute to authenticated users (frontend calls via anon/service role RPC)
GRANT EXECUTE ON FUNCTION public.auto_breach_overdue_contracts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_breach_overdue_contracts() TO anon;
