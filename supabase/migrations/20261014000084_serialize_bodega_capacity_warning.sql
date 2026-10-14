-- BUG-13 fix: warn_inventory_capacity() computed previous/current Bodega
-- Stock totals from live SUMs with no locking, so two concurrent
-- inventory_batches inserts/updates that each cross the same 80%/100%
-- threshold could both observe "previous < threshold" and each insert a
-- duplicate notification. Serialize with a transaction-scoped advisory
-- lock (same pattern already used elsewhere, e.g. supplier-contracts
-- locks) so concurrent crossings are evaluated one at a time — the second
-- caller sees the first caller's already-updated total and correctly
-- skips re-notifying. No other logic (capacity figures, thresholds,
-- message text, crossing-edge check) changed.

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
  -- Serialize concurrent threshold checks so two near-simultaneous
  -- Resecada-affecting writes can never both observe the same
  -- pre-crossing total and both emit a notification.
  PERFORM pg_advisory_xact_lock(hashtextextended('bodega-stock-capacity', 0));

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
