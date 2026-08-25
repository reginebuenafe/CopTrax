-- Atomic payment batch creation.
-- Header, details, delivery stamps, and notification are all inside one
-- PostgreSQL transaction so a partial failure rolls back everything.
CREATE OR REPLACE FUNCTION public.create_payment_batch(
  p_supplier_id         UUID,
  p_business_owner_id   UUID,
  p_payment_week        DATE,
  p_total_amount        NUMERIC,
  p_notification_msg    TEXT,
  p_details             JSONB   -- array of detail objects
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_payment_id UUID;
BEGIN
  -- 1. Payment header
  INSERT INTO public.payments (
    supplier_id, business_owner_id, payment_week,
    total_amount, payment_status, payment_method
  ) VALUES (
    p_supplier_id, p_business_owner_id, p_payment_week,
    p_total_amount, 'Pending', 'Bank Transfer'
  ) RETURNING payment_id INTO v_payment_id;

  -- 2. Payment detail lines
  INSERT INTO public.payment_details (
    payment_id, delivery_id,
    gross_weight_kg, tare_weight_kg, net_weight_kg,
    moisture_content_pct, moisture_deduction_kg,
    final_weight_kg, price_type, price_per_kg_used,
    pca_discount_amount, line_amount
  )
  SELECT
    v_payment_id,
    (elem->>'delivery_id')::UUID,
    (elem->>'gross_weight_kg')::NUMERIC,
    (elem->>'tare_weight_kg')::NUMERIC,
    (elem->>'net_weight_kg')::NUMERIC,
    (elem->>'moisture_content_pct')::NUMERIC,
    (elem->>'moisture_deduction_kg')::NUMERIC,
    (elem->>'final_weight_kg')::NUMERIC,
    elem->>'price_type',
    (elem->>'price_per_kg_used')::NUMERIC,
    (elem->>'pca_discount_amount')::NUMERIC,
    (elem->>'line_amount')::NUMERIC
  FROM jsonb_array_elements(p_details) AS elem;

  -- 3. Stamp payment_id on every delivery in this batch
  UPDATE public.deliveries
  SET payment_id = v_payment_id
  WHERE delivery_id IN (
    SELECT (elem->>'delivery_id')::UUID
    FROM jsonb_array_elements(p_details) AS elem
  );

  -- 4. Notify supplier
  INSERT INTO public.notifications (
    user_id, message, notification_type,
    related_entity_type, related_entity_id
  ) VALUES (
    p_supplier_id, p_notification_msg, 'Weekly Payment Ready',
    'payments', v_payment_id
  );

  RETURN v_payment_id;
END;
$$;

-- Grant execute to authenticated role so the frontend anon/user can call it
GRANT EXECUTE ON FUNCTION public.create_payment_batch(UUID, UUID, DATE, NUMERIC, TEXT, JSONB)
  TO authenticated;
