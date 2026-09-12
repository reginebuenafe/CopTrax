-- Correct existing capacity-warning rows that may have been created before
-- the 500-ton format was deployed. Recompute the current stock in whole tons.

DO $$
DECLARE
  v_current_kg NUMERIC;
  v_current_tons INTEGER;
BEGIN
  SELECT COALESCE(SUM(weight_kg), 0)
    INTO v_current_kg
  FROM public.inventory_batches
  WHERE batch_status IN ('Walk-in Holding', 'Ready to Merge', 'Resecada');

  v_current_tons := ROUND(v_current_kg / 1000)::INTEGER;

  UPDATE public.notifications
  SET message = 'Inventory capacity: ' || v_current_tons || 't / 500t. Consider selling soon.'
  WHERE notification_type = 'Inventory Capacity Warning';
END;
$$;