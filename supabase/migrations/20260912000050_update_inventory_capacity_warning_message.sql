-- Update the deployed trigger and any existing capacity warning to show
-- rounded tons instead of a percentage. The 80,000 kg threshold is unchanged.

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
        'Inventory capacity: ' || ROUND(v_current_kg / 1000) || 't / ' || ROUND(v_capacity_kg / 1000) || 't. Consider selling soon.',
        'inventory_capacity'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Rewrite existing capacity warnings, including the retroactive warning, with
-- the current inventory total and the new tons-based format.
DO $$
DECLARE
  v_current_kg NUMERIC;
BEGIN
  SELECT COALESCE(SUM(weight_kg), 0)
    INTO v_current_kg
  FROM public.inventory_batches
  WHERE batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada');

  UPDATE public.notifications
  SET message = 'Inventory capacity: ' || ROUND(v_current_kg / 1000) || 't / 100t. Consider selling soon.'
  WHERE notification_type = 'Inventory Capacity Warning'
    AND related_entity_type = 'inventory_capacity';
END;
$$;