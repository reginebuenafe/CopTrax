-- BUG-09 fix: delivery_allocations had no column to persist the actual
-- price_per_kg used for a Spot-priced cascade-overflow row at delivery time.
-- record_contractual_delivery() already computed v_spot_price but only
-- returned it in the transient JSON response, never in the inserted row —
-- so the historical spot price in effect at delivery time could never be
-- reconstructed/audited afterward. Walk-in deliveries already snapshot
-- their spot price (walkin_spot_price_kg); this brings Spot-cascade rows
-- to the same standard.

ALTER TABLE public.delivery_allocations
  ADD COLUMN IF NOT EXISTS spot_price_per_kg_at_delivery DECIMAL(12,4);

-- record_contractual_delivery(): persist v_spot_price (already computed)
-- on the Spot overflow row instead of only including it in the JSON result.
CREATE OR REPLACE FUNCTION public.record_contractual_delivery(
  p_supplier_id       UUID,
  p_weigher_id        UUID,
  p_delivery_date     DATE,
  p_truck_plate       TEXT,
  p_gross_kg          DECIMAL(12,3),
  p_tare_kg           DECIMAL(12,3)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net_kg            DECIMAL(12,3);
  v_delivery_id       UUID;
  v_primary_contract  UUID;
  v_spot_price        DECIMAL(12,4);
  v_remaining         DECIMAL(12,3);
  v_seq               INTEGER := 1;
  v_alloc_rows        JSONB   := '[]'::JSONB;

  v_contract          RECORD;
  v_contracted_kg     DECIMAL(12,3);
  v_allocated_kg      DECIMAL(12,3);
  v_available_kg      DECIMAL(12,3);
  v_to_alloc          DECIMAL(12,3);
BEGIN
  IF p_gross_kg <= 0 THEN
    RETURN jsonb_build_object('error', 'Gross weight must be greater than zero.');
  END IF;
  IF p_tare_kg < 0 THEN
    RETURN jsonb_build_object('error', 'Tare weight cannot be negative.');
  END IF;
  IF p_tare_kg >= p_gross_kg THEN
    RETURN jsonb_build_object('error', 'Tare weight must be less than gross weight.');
  END IF;

  v_net_kg := p_gross_kg - p_tare_kg;

  SELECT price_per_kg INTO v_spot_price FROM public.spot_price LIMIT 1;
  v_spot_price := COALESCE(v_spot_price, 0);

  INSERT INTO public.deliveries (
    delivery_source, supplier_id, delivery_date,
    truck_plate_number, weigher_id, delivery_status, contract_id
  ) VALUES (
    'Contract-based', p_supplier_id, p_delivery_date,
    NULLIF(TRIM(p_truck_plate), ''), p_weigher_id, 'Weighed', NULL
  )
  RETURNING delivery_id INTO v_delivery_id;

  INSERT INTO public.weighing_records (
    delivery_id, weigher_id, gross_weight_kg, tare_weight_kg, net_weight_kg
  ) VALUES (
    v_delivery_id, p_weigher_id, p_gross_kg, p_tare_kg, v_net_kg
  );

  v_remaining := v_net_kg;

  FOR v_contract IN
    SELECT c.contract_id, c.contract_number, c.negotiated_price_per_kg, c.due_date,
           (c.contracted_tons * 1000)::DECIMAL(12,3) AS contracted_kg
    FROM   public.contracts c
    WHERE  c.supplier_id = p_supplier_id
      AND  c.status = 'Active'
    ORDER  BY c.due_date ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.001;

    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO   v_allocated_kg
    FROM   public.delivery_allocations da
    JOIN   public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE  da.contract_id = v_contract.contract_id
      AND  d.delivery_status <> 'Rejected';

    v_available_kg := GREATEST(0, v_contract.contracted_kg - v_allocated_kg);

    CONTINUE WHEN v_available_kg <= 0.001;

    v_to_alloc := LEAST(v_available_kg, v_remaining);

    IF v_primary_contract IS NULL THEN
      v_primary_contract := v_contract.contract_id;
    END IF;

    INSERT INTO public.delivery_allocations (
      delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order
    ) VALUES (
      v_delivery_id, v_contract.contract_id, v_to_alloc, 'Negotiated', v_seq
    );

    v_alloc_rows := v_alloc_rows || jsonb_build_object(
      'contract_id',          v_contract.contract_id,
      'contract_number',      v_contract.contract_number,
      'allocated_weight_kg',  v_to_alloc,
      'price_type',           'Negotiated',
      'price_per_kg',         v_contract.negotiated_price_per_kg,
      'sequence_order',       v_seq
    );

    v_remaining := v_remaining - v_to_alloc;
    v_seq       := v_seq + 1;
  END LOOP;

  IF v_remaining > 0.001 THEN
    INSERT INTO public.delivery_allocations (
      delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order,
      spot_price_per_kg_at_delivery
    ) VALUES (
      v_delivery_id, NULL, v_remaining, 'Spot', v_seq, v_spot_price
    );

    v_alloc_rows := v_alloc_rows || jsonb_build_object(
      'contract_id',         NULL,
      'contract_number',     NULL,
      'allocated_weight_kg', v_remaining,
      'price_type',          'Spot',
      'price_per_kg',        v_spot_price,
      'sequence_order',      v_seq
    );
  END IF;

  IF v_primary_contract IS NOT NULL THEN
    UPDATE public.deliveries
    SET    contract_id = v_primary_contract
    WHERE  delivery_id = v_delivery_id;
  END IF;

  RETURN jsonb_build_object(
    'delivery_id',  v_delivery_id,
    'net_kg',       v_net_kg,
    'allocations',  v_alloc_rows
  );
END;
$$;

-- recompute_delivery_allocation() (migration 066): it deletes and replays a
-- delivery's allocation rows once the Final Weight is known. Preserve the
-- delivery-time spot price already captured above (not "today's" spot
-- price) by reading it off the existing Spot row before deleting, and
-- falling back to the current spot price only for legacy rows that
-- predate this column.
CREATE OR REPLACE FUNCTION public.recompute_delivery_allocation(p_delivery_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result             public.quality_result_enum;
  v_mc                 DECIMAL(5,2);
  v_rounded_mc         DECIMAL(4,1);
  v_discount_pct       DECIMAL(5,2) := 0;
  v_net_kg             DECIMAL(12,3);
  v_final_kg           DECIMAL(12,3);
  v_remaining          DECIMAL(12,3);
  v_seq                INTEGER := 1;
  v_primary            UUID;
  v_orig_contract_ids  UUID[];
  v_contract_id        UUID;
  v_contracted_kg      DECIMAL(12,3);
  v_allocated_kg       DECIMAL(12,3);
  v_available_kg       DECIMAL(12,3);
  v_to_alloc           DECIMAL(12,3);
  v_spot_price         DECIMAL(12,4);
BEGIN
  SELECT qr.result, li.moisture_content_pct
  INTO   v_result, v_mc
  FROM   public.quality_results qr
  JOIN   public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
  WHERE  qr.delivery_id = p_delivery_id
  ORDER  BY qr.evaluated_at DESC
  LIMIT  1;

  IF v_result IS DISTINCT FROM 'Accepted' THEN
    RETURN;
  END IF;

  SELECT wr.net_weight_kg INTO v_net_kg
  FROM public.weighing_records wr
  WHERE wr.delivery_id = p_delivery_id
  ORDER BY wr.weighed_at DESC
  LIMIT 1;

  IF v_mc IS NULL OR v_net_kg IS NULL OR v_net_kg <= 0 THEN
    RETURN;
  END IF;

  IF v_mc <= 5.0 THEN
    v_discount_pct := 0;
  ELSE
    v_rounded_mc := ROUND(v_mc, 1);
    SELECT discount_value INTO v_discount_pct
    FROM public.pca_discount_table
    WHERE moisture_content_pct = v_rounded_mc;
    v_discount_pct := COALESCE(v_discount_pct, 0);
  END IF;

  v_final_kg := GREATEST(0, v_net_kg * (1 - v_discount_pct / 100.0));

  SELECT array_agg(contract_id ORDER BY sequence_order)
  INTO   v_orig_contract_ids
  FROM   public.delivery_allocations
  WHERE  delivery_id = p_delivery_id
    AND  contract_id IS NOT NULL;

  -- Preserve the delivery-time Spot price (set by record_contractual_
  -- delivery) rather than re-fetching today's spot price on recompute.
  SELECT spot_price_per_kg_at_delivery INTO v_spot_price
  FROM   public.delivery_allocations
  WHERE  delivery_id = p_delivery_id AND price_type = 'Spot'
  ORDER  BY sequence_order LIMIT 1;

  IF v_spot_price IS NULL THEN
    -- Legacy delivery predating this column — no historical price was
    -- ever captured for it, so there is nothing to preserve.
    SELECT price_per_kg INTO v_spot_price FROM public.spot_price LIMIT 1;
    v_spot_price := COALESCE(v_spot_price, 0);
  END IF;

  DELETE FROM public.delivery_allocations WHERE delivery_id = p_delivery_id;

  v_remaining := v_final_kg;
  v_primary   := NULL;

  IF v_orig_contract_ids IS NOT NULL THEN
    FOREACH v_contract_id IN ARRAY v_orig_contract_ids LOOP
      EXIT WHEN v_remaining <= 0.001;

      SELECT (contracted_tons * 1000)::DECIMAL(12,3) INTO v_contracted_kg
      FROM   public.contracts
      WHERE  contract_id = v_contract_id AND status = 'Active'
      FOR UPDATE;

      CONTINUE WHEN NOT FOUND;

      SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
      INTO   v_allocated_kg
      FROM   public.delivery_allocations da
      JOIN   public.deliveries d ON d.delivery_id = da.delivery_id
      WHERE  da.contract_id = v_contract_id
        AND  d.delivery_status <> 'Rejected';

      v_available_kg := GREATEST(0, v_contracted_kg - v_allocated_kg);
      CONTINUE WHEN v_available_kg <= 0.001;

      v_to_alloc := LEAST(v_available_kg, v_remaining);
      IF v_primary IS NULL THEN
        v_primary := v_contract_id;
      END IF;

      INSERT INTO public.delivery_allocations
        (delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order)
      VALUES
        (p_delivery_id, v_contract_id, v_to_alloc, 'Negotiated', v_seq);

      v_remaining := v_remaining - v_to_alloc;
      v_seq       := v_seq + 1;
    END LOOP;
  END IF;

  IF v_remaining > 0.001 THEN
    INSERT INTO public.delivery_allocations
      (delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order,
       spot_price_per_kg_at_delivery)
    VALUES
      (p_delivery_id, NULL, v_remaining, 'Spot', v_seq, v_spot_price);
  END IF;

  UPDATE public.deliveries
  SET    contract_id = v_primary
  WHERE  delivery_id = p_delivery_id;
END;
$$;
