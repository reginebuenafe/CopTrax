-- ============================================================
-- Migration 074: Fix PCA deduction boundary at exactly MC = 5.0cc
-- (BUG-02).
--
-- The moisture-content boundary was implemented everywhere as
-- "MC <= 5.0cc -> 0% deduction", but the official PCA discount table
-- (seed/pca_discount_table.sql) has an explicit row for 5.0cc with a
-- 2.0% discount, and the documented business rule is "MC < 5.0% -> 0%
-- deduction" (strictly less than). A delivery assessed at exactly
-- 5.0cc was therefore given 0% deduction instead of the correct 2.0%,
-- overpaying the Supplier for that delivery.
--
-- This migration only corrects the boundary comparison in
-- public.recompute_delivery_allocation() — the single live DB function
-- that computes a delivery's Final Weight from its Net Weight and PCA
-- deduction % (migration 20260917000066_fix_final_weight_cascade_
-- reallocation.sql last replaced this function; migration
-- 20260917000065's own copy of this logic was already superseded by
-- 066 and is not live). No other moisture bracket, payment
-- calculation, or allocation/cascade logic is touched — this is a
-- CREATE OR REPLACE of the exact same function body from migration
-- 066, with only "v_mc <= 5.0" changed to "v_mc < 5.0".
-- ============================================================

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
BEGIN
  SELECT qr.result, li.moisture_content_pct
  INTO   v_result, v_mc
  FROM   public.quality_results qr
  JOIN   public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
  WHERE  qr.delivery_id = p_delivery_id
  ORDER  BY qr.evaluated_at DESC
  LIMIT  1;

  -- Only an Accepted delivery is ever credited toward a contract/spot —
  -- a Rejected delivery's allocations already never count anywhere.
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

  -- Same deterministic PCA lookup convention used everywhere else.
  -- MC < 5.0cc -> 0% deduction (strictly less than); MC = 5.0cc falls
  -- through to the literal table lookup, which has a 2.0% row for 5.0.
  IF v_mc < 5.0 THEN
    v_discount_pct := 0;
  ELSE
    v_rounded_mc := ROUND(v_mc, 1);
    SELECT discount_value INTO v_discount_pct
    FROM public.pca_discount_table
    WHERE moisture_content_pct = v_rounded_mc;
    v_discount_pct := COALESCE(v_discount_pct, 0);
  END IF;

  v_final_kg := GREATEST(0, v_net_kg * (1 - v_discount_pct / 100.0));

  -- Preserve the ORIGINAL cascade decision (which contracts, in which
  -- priority order) that record_contractual_delivery() made at weighing
  -- time — capture it BEFORE deleting. We only correct the AMOUNTS to
  -- true Final Weight here; we deliberately never re-discover a
  -- different/new set of contracts.
  SELECT array_agg(contract_id ORDER BY sequence_order)
  INTO   v_orig_contract_ids
  FROM   public.delivery_allocations
  WHERE  delivery_id = p_delivery_id
    AND  contract_id IS NOT NULL;

  -- Wipe this delivery's provisional split so the capacity sums below
  -- reflect every OTHER delivery only.
  DELETE FROM public.delivery_allocations WHERE delivery_id = p_delivery_id;

  v_remaining := v_final_kg;
  v_primary   := NULL;

  IF v_orig_contract_ids IS NOT NULL THEN
    FOREACH v_contract_id IN ARRAY v_orig_contract_ids LOOP
      EXIT WHEN v_remaining <= 0.001;

      -- Skip (fall through to Spot) if this contract is no longer
      -- Active by the time Lab submits results.
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
      (delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order)
    VALUES
      (p_delivery_id, NULL, v_remaining, 'Spot', v_seq);
  END IF;

  -- Keep deliveries.contract_id ("primary" contract label) consistent
  -- with the corrected split.
  UPDATE public.deliveries
  SET    contract_id = v_primary
  WHERE  delivery_id = p_delivery_id;
END;
$$;

-- ------------------------------------------------------------
-- Repair existing data affected by this specific boundary bug only:
-- Accepted, Contract-based deliveries whose recorded moisture content
-- is exactly 5.0cc (the only value the old "<= 5.0" rule miscomputed;
-- every other bracket was already correct and is left untouched).
-- Uses the same safety guard as migration 066's own backfill: only
-- reprocess a delivery when every one of its current allocation rows
-- points at either Spot or a still-Active contract, so settled
-- Completed/Breached contracts (already used by ratings/payments/
-- reports) are never retroactively rewritten.
--
-- Three places stored the same wrong "0% deduction" outcome at
-- submission time and are corrected together, for the same narrow set
-- of affected deliveries, so BO Deliveries / Inventory / Payments all
-- agree once this migration is applied:
--   1. delivery_allocations.allocated_weight_kg (via
--      recompute_delivery_allocation(), already fixed above)
--   2. quality_results.remarks — the "Deduction: N%" text that
--      BODeliveriesPage/SupplierDeliveriesPage parse for their "PCA
--      Deduction" column
--   3. inventory_batches.weight_kg — the Final Weight the Lab UI
--      computed and stored directly at acceptance time
-- ------------------------------------------------------------
DO $$
DECLARE
  v_row RECORD;
  v_correct_discount DECIMAL(4,1);
BEGIN
  SELECT discount_value INTO v_correct_discount
  FROM public.pca_discount_table
  WHERE moisture_content_pct = 5.0;

  -- Table-driven, never guessed: if the official table has no 5.0 row
  -- for some reason, do nothing rather than invent a value.
  IF v_correct_discount IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT d.delivery_id, qr.quality_id, wr.net_weight_kg
    FROM   public.deliveries d
    JOIN   public.quality_results qr ON qr.delivery_id = d.delivery_id AND qr.result = 'Accepted'
    JOIN   public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
    JOIN   public.weighing_records wr ON wr.delivery_id = d.delivery_id
    WHERE  d.delivery_source = 'Contract-based'
      AND  li.moisture_content_pct = 5.0
      AND  NOT EXISTS (
        SELECT 1
        FROM   public.delivery_allocations da
        JOIN   public.contracts c ON c.contract_id = da.contract_id
        WHERE  da.delivery_id = d.delivery_id
          AND  c.status <> 'Active'
      )
    ORDER BY COALESCE(
      (SELECT MIN(wr2.weighed_at) FROM public.weighing_records wr2 WHERE wr2.delivery_id = d.delivery_id),
      d.created_at
    ) ASC
  LOOP
    -- 1. delivery_allocations (contract fulfillment / rating / payments)
    PERFORM public.recompute_delivery_allocation(v_row.delivery_id);

    -- 2. quality_results.remarks — only touch the deduction percentage
    -- substring, leaving the rest of the remarks text (and any Rejected
    -- rows, already excluded above) untouched.
    UPDATE public.quality_results
    SET    remarks = regexp_replace(
             remarks,
             '(Discount|Deduction):\s*[0-9.]+%',
             '\1: ' || v_correct_discount || '%'
           )
    WHERE  quality_id = v_row.quality_id;

    -- 3. inventory_batches.weight_kg — recompute the same way
    -- InspectionQueuePage.jsx does at submission time, using the
    -- now-correct discount percentage.
    UPDATE public.inventory_batches
    SET    weight_kg = GREATEST(0, v_row.net_weight_kg * (1 - v_correct_discount / 100.0))
    WHERE  delivery_id = v_row.delivery_id
      AND  source_type = 'Contractual';
  END LOOP;
END;
$$;
