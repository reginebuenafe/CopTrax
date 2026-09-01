-- Atomic server-side delivery allocation to fix the client-side race condition.
--
-- record_contractual_delivery() locks the supplier's Active contracts for the
-- duration of the transaction (SELECT ... FOR UPDATE), recomputes allocation
-- from fresh DB state, then inserts delivery + weighing_record +
-- delivery_allocations in one atomic operation.
--
-- This replaces the three separate client-side INSERT calls in
-- ContractualDeliveryForm.jsx and prevents concurrent Weigher submissions from
-- over-allocating the same contract.

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
  v_alloc_insert      JSONB[];

  -- cursor over active contracts ordered by earliest deadline (locked)
  v_contract          RECORD;
  v_contracted_kg     DECIMAL(12,3);
  v_allocated_kg      DECIMAL(12,3);
  v_available_kg      DECIMAL(12,3);
  v_to_alloc          DECIMAL(12,3);
BEGIN
  -- ── Basic validation ────────────────────────────────────────────────────────
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

  -- ── Fetch current spot price ────────────────────────────────────────────────
  SELECT price_per_kg INTO v_spot_price FROM public.spot_price LIMIT 1;
  v_spot_price := COALESCE(v_spot_price, 0);

  -- ── Insert delivery record ──────────────────────────────────────────────────
  -- primary contract_id will be patched below once we know the first allocation
  INSERT INTO public.deliveries (
    delivery_source, supplier_id, delivery_date,
    truck_plate_number, weigher_id, delivery_status, contract_id
  ) VALUES (
    'Contract-based', p_supplier_id, p_delivery_date,
    NULLIF(TRIM(p_truck_plate), ''), p_weigher_id, 'Weighed', NULL
  )
  RETURNING delivery_id INTO v_delivery_id;

  -- ── Insert weighing record ──────────────────────────────────────────────────
  INSERT INTO public.weighing_records (
    delivery_id, weigher_id, gross_weight_kg, tare_weight_kg, net_weight_kg
  ) VALUES (
    v_delivery_id, p_weigher_id, p_gross_kg, p_tare_kg, v_net_kg
  );

  -- ── Lock + iterate active contracts in earliest-deadline order ──────────────
  -- SELECT FOR UPDATE prevents a concurrent call from reading stale allocated_kg
  -- for the same supplier's contracts until this transaction commits.
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

    -- Sum already-accepted+weighed allocations for this contract (excluding Rejected deliveries)
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO   v_allocated_kg
    FROM   public.delivery_allocations da
    JOIN   public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE  da.contract_id = v_contract.contract_id
      AND  d.delivery_status <> 'Rejected';

    v_available_kg := GREATEST(0, v_contract.contracted_kg - v_allocated_kg);

    CONTINUE WHEN v_available_kg <= 0.001;

    v_to_alloc := LEAST(v_available_kg, v_remaining);

    -- Track first contract for the delivery.contract_id FK
    IF v_primary_contract IS NULL THEN
      v_primary_contract := v_contract.contract_id;
    END IF;

    INSERT INTO public.delivery_allocations (
      delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order
    ) VALUES (
      v_delivery_id, v_contract.contract_id, v_to_alloc, 'Negotiated', v_seq
    );

    -- Accumulate for return JSON
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

  -- ── Spot overflow ───────────────────────────────────────────────────────────
  IF v_remaining > 0.001 THEN
    INSERT INTO public.delivery_allocations (
      delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order
    ) VALUES (
      v_delivery_id, NULL, v_remaining, 'Spot', v_seq
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

  -- ── Patch delivery.contract_id with first contract (if any) ─────────────────
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

-- Grant execute to authenticated users (Weigher role is enforced by the frontend + RLS)
GRANT EXECUTE ON FUNCTION public.record_contractual_delivery(UUID,UUID,DATE,TEXT,DECIMAL,DECIMAL)
  TO authenticated;
