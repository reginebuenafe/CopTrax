-- Backfill the capacity warning when inventory already exceeded the threshold
-- before the trigger was installed. The NOT EXISTS guard keeps this idempotent.

DO $$
DECLARE
  v_capacity_kg NUMERIC := 100000;
  v_warning_kg NUMERIC := 80000;
  v_current_kg NUMERIC;
  v_owner_id UUID;
BEGIN
  SELECT COALESCE(SUM(weight_kg), 0)
    INTO v_current_kg
  FROM public.inventory_batches
  WHERE batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada');

  IF v_current_kg >= v_warning_kg THEN
    SELECT u.user_id
      INTO v_owner_id
    FROM public.users u
    JOIN public.roles r ON r.role_id = u.role_id
    WHERE r.role_name = 'Business Owner'
      AND u.account_status = 'Active'
    LIMIT 1;

    IF v_owner_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.notifications
      WHERE user_id = v_owner_id
        AND notification_type = 'Inventory Capacity Warning'
        AND related_entity_type = 'inventory_capacity'
    ) THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type)
      VALUES (
        v_owner_id,
        'Inventory Capacity Warning',
        'Inventory capacity: ' || ROUND(v_current_kg / 1000) || 't / ' || ROUND(v_capacity_kg / 1000) || 't. Consider selling soon.',
        'inventory_capacity'
      );
    END IF;
  END IF;
END;
$$;