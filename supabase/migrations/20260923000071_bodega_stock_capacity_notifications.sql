-- Renames the Resecada pool concept to "Bodega Stock" in Business Owner
-- notifications, switches the capacity check to the same figure now shown
-- on the Owner Inventory page (SUM of each Resecada batch's own delivery
-- Net Weight, i.e. weighing_records.net_weight_kg — NOT the post-PCA
-- weight_kg stored on inventory_batches), and adds the missing 100%
-- ("Full") threshold alongside the existing 80% ("Almost Full") one.
--
-- Capacity remains 500,000 kg (500 tons) — the real, already-agreed value
-- from migrations 20260912000051-53, not an invented number. Both
-- thresholds reuse the existing crossing-edge technique (previous < X AND
-- current >= X) already used for the 80% band, so a given threshold only
-- ever notifies once per crossing, exactly as before.
--
-- inventory_batches.batch_status ('Resecada', 'Walk-in Holding',
-- 'Ready to Merge') and every other column/enum are unchanged — this is
-- purely a notification-message/aggregation-basis update, no delivery
-- records, moisture deductions, payments, or contract allocations touched.

CREATE OR REPLACE FUNCTION public.warn_inventory_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity_kg NUMERIC := 500000;   -- 500 tons — matches the Owner Inventory page's capacity display
  v_almost_full_kg NUMERIC := 400000; -- 80% of capacity
  v_current_kg NUMERIC;
  v_previous_kg NUMERIC;
  v_row_net_kg NUMERIC;
  v_owner_id UUID;
BEGIN
  -- "Bodega Stock" = SUM of each Resecada batch's own delivery Net Weight
  -- (Gross − Tare, recorded at weighing time), matching the Owner
  -- Inventory page's renamed total exactly.
  SELECT COALESCE(SUM(wr.net_weight_kg), 0)
    INTO v_current_kg
  FROM public.inventory_batches ib
  JOIN public.weighing_records wr ON wr.delivery_id = ib.delivery_id
  WHERE ib.batch_status = 'Resecada';

  SELECT wr.net_weight_kg
    INTO v_row_net_kg
  FROM public.weighing_records wr
  WHERE wr.delivery_id = NEW.delivery_id
  LIMIT 1;
  v_row_net_kg := COALESCE(v_row_net_kg, 0);

  IF TG_OP = 'INSERT' THEN
    v_previous_kg := v_current_kg - CASE WHEN NEW.batch_status = 'Resecada' THEN v_row_net_kg ELSE 0 END;
  ELSE
    v_previous_kg := v_current_kg
      - CASE WHEN NEW.batch_status = 'Resecada' THEN v_row_net_kg ELSE 0 END
      + CASE WHEN OLD.batch_status = 'Resecada' THEN v_row_net_kg ELSE 0 END;
  END IF;

  SELECT u.user_id
    INTO v_owner_id
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE r.role_name = 'Business Owner'
    AND u.account_status = 'Active'
  LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    -- 80% — "Almost Full"
    IF v_previous_kg < v_almost_full_kg AND v_current_kg >= v_almost_full_kg THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type)
      VALUES (
        v_owner_id,
        'Inventory Capacity Warning',
        'Bodega Stock is Almost Full: ' || ROUND(v_current_kg / 1000)::INTEGER || 't / ' || ROUND(v_capacity_kg / 1000)::INTEGER || 't. Consider selling soon.',
        'inventory_capacity'
      );
    END IF;

    -- 100% — "Full"
    IF v_previous_kg < v_capacity_kg AND v_current_kg >= v_capacity_kg THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type)
      VALUES (
        v_owner_id,
        'Inventory Capacity Warning',
        'Bodega Stock is Full: ' || ROUND(v_current_kg / 1000)::INTEGER || 't / ' || ROUND(v_capacity_kg / 1000)::INTEGER || 't. No additional capacity remains — sell or merge before accepting more.',
        'inventory_capacity'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition itself is unchanged (same events, same table) — only
-- the function body above changed.
DROP TRIGGER IF EXISTS inventory_capacity_warning_trigger ON public.inventory_batches;

CREATE TRIGGER inventory_capacity_warning_trigger
  AFTER INSERT OR UPDATE OF weight_kg, batch_status ON public.inventory_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.warn_inventory_capacity();
