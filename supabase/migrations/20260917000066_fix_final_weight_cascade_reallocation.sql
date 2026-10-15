-- ============================================================
-- Migration 066: Fix migration 065's flawed "scale down" approach —
-- recompute the FULL cascade split using Final Weight instead of just
-- shrinking whatever split was decided at weighing time.
--
-- Bug found in migration 065: its trigger scaled EVERY existing
-- delivery_allocations row for a delivery down by the same ratio
-- (final_kg / net_kg), including a contract row that was NOT a
-- proportional share of the delivery — it was a HARD CAP to "however
-- much room was left in the contract" at weighing time (computed from
-- Net Weight, since Final Weight isn't known until Lab inspects).
--
-- Example that reproduced the bug: CTR-00001 (40 tons agreed) had
-- 16,400.36 kg of room left (net-weight terms) when a 27,679 kg (net)
-- delivery arrived. record_contractual_delivery() capped the contract
-- portion at 16,400.36 kg and sent the remaining 11,278.64 kg to Spot.
-- Once Lab found MC 8.9cc -> 3% deduction, migration 065's trigger
-- scaled BOTH rows down by 0.97 -> contract got only 15,908.35 kg
-- (leaving the contract 490 kg short of its cap) while the freed-up
-- 490 kg of contract room was never reclaimed — it stayed stranded in
-- the Spot bucket instead of topping the contract back up to capacity.
--
-- Fix: once a delivery's Final Weight becomes known (Lab submits an
-- Accepted quality result), DELETE its existing (net-weight-based,
-- provisional) allocation rows and REPLAY the split using the SAME
-- contract(s), in the SAME priority order, that record_contractual_
-- delivery() already decided on at weighing time — but now filling each
-- one up to its true remaining capacity from the delivery's Final
-- Weight instead of proportionally shrinking. We deliberately do NOT
-- re-discover a fresh set of "any currently Active contract" — that
-- would let a contract that only gained room (or was only signed) AFTER
-- this delivery was weighed steal a slot it never had, or strip a
-- contract's rightful share the moment it completes via a different
-- delivery while this one is still awaiting lab results. Only the
-- AMOUNTS are corrected; WHICH contracts get priority is untouched.
--
-- The backfill in migration 065 used the same broken "scale down" math
-- on existing data, so it is corrected here too — but ONLY for
-- deliveries whose allocations are entirely against currently-Active
-- contracts (or Spot). Deliveries touching a Completed/Breached
-- contract are left untouched: those contracts are settled/frozen
-- (already used by ratings/payments/reports) and are intentionally out
-- of scope for an automatic retroactive rewrite.
-- ============================================================

-- ------------------------------------------------------------
-- Shared recompute: wipe + replay the cascade split for ONE delivery,
-- using its actual Final Weight. Used by both the live trigger (new
-- lab results) and the one-time backfill below.
-- ------------------------------------------------------------
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

  -- Preserve the ORIGINAL cascade decision (which contracts, in which
  -- priority order) that record_contractual_delivery() made at weighing
  -- time — capture it BEFORE deleting. We only correct the AMOUNTS to
  -- true Final Weight here; we deliberately never re-discover a
  -- different/new set of contracts. Re-querying "any currently Active
  -- contract" fresh would let a contract that only gained room (or was
  -- only signed) AFTER this delivery was weighed steal a slot it never
  -- actually had, or strip a contract's rightful share the instant it
  -- completes via a different delivery while this one is still awaiting
  -- lab results — both would be an unrelated behavior/fairness change
  -- beyond the reported Net-vs-Final-weight bug.
  SELECT array_agg(contract_id ORDER BY sequence_order)
  INTO   v_orig_contract_ids
  FROM   public.delivery_allocations
  WHERE  delivery_id = p_delivery_id
    AND  contract_id IS NOT NULL;

  -- Wipe this delivery's provisional (net-weight-based) split so the
  -- capacity sums below reflect every OTHER delivery only.
  DELETE FROM public.delivery_allocations WHERE delivery_id = p_delivery_id;

  v_remaining := v_final_kg;
  v_primary   := NULL;

  IF v_orig_contract_ids IS NOT NULL THEN
    FOREACH v_contract_id IN ARRAY v_orig_contract_ids LOOP
      EXIT WHEN v_remaining <= 0.001;

      -- Skip (fall through to Spot) if this contract is no longer
      -- Active by the time Lab submits results — matches the existing
      -- "only Active contracts accept delivery transactions" rule.
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
-- Replace migration 065's trigger function: instead of scaling
-- existing rows, replay the full cascade via the shared function above.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_final_weight_to_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.result = 'Accepted' THEN
    PERFORM public.recompute_delivery_allocation(NEW.delivery_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_final_weight_to_allocations ON public.quality_results;
CREATE TRIGGER trg_apply_final_weight_to_allocations
  AFTER INSERT ON public.quality_results
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_final_weight_to_allocations();

-- ------------------------------------------------------------
-- Repair existing data that migration 065's flawed backfill/trigger
-- already mis-shrunk. Reprocess every Accepted, Contract-based
-- delivery in the exact order it was originally weighed (capacity
-- depends on what came before), but ONLY when doing so is safe:
-- every one of its current allocation rows must point at either Spot
-- or a still-Active contract. If any row belongs to a Completed/
-- Breached contract, that contract's numbers are settled (already
-- used by ratings/payments/reports) and are skipped intentionally.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_delivery_id UUID;
BEGIN
  FOR v_delivery_id IN
    SELECT d.delivery_id
    FROM   public.deliveries d
    JOIN   public.quality_results qr ON qr.delivery_id = d.delivery_id AND qr.result = 'Accepted'
    WHERE  d.delivery_source = 'Contract-based'
      AND  NOT EXISTS (
        SELECT 1
        FROM   public.delivery_allocations da
        JOIN   public.contracts c ON c.contract_id = da.contract_id
        WHERE  da.delivery_id = d.delivery_id
          AND  c.status <> 'Active'
      )
    ORDER BY COALESCE(
      (SELECT MIN(wr.weighed_at) FROM public.weighing_records wr WHERE wr.delivery_id = d.delivery_id),
      d.created_at
    ) ASC
  LOOP
    PERFORM public.recompute_delivery_allocation(v_delivery_id);
  END LOOP;

  -- Corrected allocations may now legitimately fill a contract to 100%
  -- for the first time (they were previously stuck a little short) —
  -- run the existing reconciliation so it flips to Completed right away
  -- instead of waiting for the next page load.
  PERFORM public.auto_complete_fulfilled_contracts();
END;
$$;
