-- Notify the Business Owner when active inventory reaches 80% of the
-- 100-ton storage capacity. The warning is emitted only when stock crosses
-- into the warning band, avoiding repeated notifications for every batch.

CREATE OR REPLACE FUNCTION public.warn_inventory_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity_kg NUMERIC := 100000;
  v_warning_kg NUMERIC := 80000;
  v_current_kg NUMERIC;
  v_previous_kg NUMERIC;
  v_owner_id UUID;
BEGIN
  SELECT COALESCE(SUM(weight_kg), 0)
    INTO v_current_kg
  FROM public.inventory_batches
  WHERE batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada');

  IF TG_OP = 'INSERT' THEN
    v_previous_kg := v_current_kg - CASE
      WHEN NEW.batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada') THEN NEW.weight_kg
      ELSE 0
    END;
  ELSE
    v_previous_kg := v_current_kg
      - CASE
          WHEN NEW.batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada') THEN NEW.weight_kg
          ELSE 0
        END
      + CASE
          WHEN OLD.batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada') THEN OLD.weight_kg
          ELSE 0
        END;
  END IF;

  IF v_previous_kg < v_warning_kg AND v_current_kg >= v_warning_kg THEN
    SELECT u.user_id
      INTO v_owner_id
    FROM public.users u
    JOIN public.roles r ON r.role_id = u.role_id
    WHERE r.role_name = 'Business Owner'
      AND u.account_status = 'Active'
    LIMIT 1;

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type)
      VALUES (
        v_owner_id,
        'Inventory Capacity Warning',
        'Inventory has reached ' || ROUND((v_current_kg / v_capacity_kg) * 100) || '% of the 100-ton capacity. Consider selling soon.',
        'inventory_capacity'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_capacity_warning_trigger ON public.inventory_batches;

CREATE TRIGGER inventory_capacity_warning_trigger
  AFTER INSERT OR UPDATE OF weight_kg, batch_status ON public.inventory_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.warn_inventory_capacity();