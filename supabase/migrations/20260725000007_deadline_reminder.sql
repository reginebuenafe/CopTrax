-- ============================================================
-- Migration 007: Contract Deadline Reminder
-- Scheduled daily to notify Business Owner and Supplier when
-- an Active contract's due_date is 3 or fewer days away.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_contract_deadlines()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract  RECORD;
  days_left   INTEGER;
BEGIN
  FOR v_contract IN
    SELECT c.contract_id, c.contract_number, c.due_date,
           c.supplier_id, c.business_owner_id
    FROM public.contracts c
    WHERE c.status = 'Active'
      AND c.due_date >= CURRENT_DATE
      AND c.due_date <= CURRENT_DATE + INTERVAL '3 days'
  LOOP
    days_left := v_contract.due_date - CURRENT_DATE;

    -- Notify supplier
    INSERT INTO public.notifications
      (user_id, notification_type, message, related_entity_type, related_entity_id)
    VALUES (
      v_contract.supplier_id,
      'Deadline Reminder',
      'Contract ' || v_contract.contract_number || ' is due in ' ||
        CASE days_left
          WHEN 0 THEN 'today'
          WHEN 1 THEN '1 day'
          ELSE days_left || ' days'
        END || ' (' || TO_CHAR(v_contract.due_date, 'Mon DD, YYYY') || '). Ensure all deliveries are completed on time.',
      'contracts',
      v_contract.contract_id
    );

    -- Notify business owner
    INSERT INTO public.notifications
      (user_id, notification_type, message, related_entity_type, related_entity_id)
    VALUES (
      v_contract.business_owner_id,
      'Deadline Reminder',
      'Contract ' || v_contract.contract_number || ' deadline is in ' ||
        CASE days_left
          WHEN 0 THEN 'today'
          WHEN 1 THEN '1 day'
          ELSE days_left || ' days'
        END || ' (' || TO_CHAR(v_contract.due_date, 'Mon DD, YYYY') || ').',
      'contracts',
      v_contract.contract_id
    );
  END LOOP;
END;
$$;

-- Schedule the deadline check to run daily at 07:00 UTC (3pm PHT)
SELECT cron.schedule(
  'check-contract-deadlines-daily',
  '0 7 * * *',
  $$
    SELECT public.check_contract_deadlines();
  $$
);
