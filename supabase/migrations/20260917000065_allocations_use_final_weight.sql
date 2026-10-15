-- ============================================================
-- Migration 065: Contract allocations must credit the FINAL weight
-- (post-PCA-moisture-deduction), never the raw Net Weight.
--
-- Root cause: record_contractual_delivery() (migration 042) inserts
-- delivery_allocations.allocated_weight_kg at WEIGHING time, using only
-- Gross - Tare = Net Weight — because the moisture content (and therefore
-- the PCA deduction %) is only known later, once Laboratory Staff submits
-- their inspection. That allocated_weight_kg value is never corrected
-- afterwards, so every downstream consumer that reads it — contract
-- fulfillment / remaining quantity (BOContractsPage, MyContractsPage),
-- auto-complete-on-fulfillment (migration 062), the allocation-cap guard
-- (migration 063), supplier rating (compute_supplier_rating), and the
-- "Allocation Breakdown" delivery detail views (BODeliveriesPage,
-- SupplierDeliveriesPage, PaymentsPage) — ends up crediting the contract
-- with the pre-deduction Net Weight instead of the accepted Final Weight,
-- exactly as shown in the reported bug (12,898.00 kg net allocated
-- instead of the correct 12,807.71 kg final).
--
-- Fix: once Laboratory Staff records a quality result (the single point
-- where the moisture/PCA deduction becomes known), a trigger recomputes
-- the delivery's Final Weight from its actual Net Weight and PCA
-- deduction %, then scales every delivery_allocations row for that
-- delivery down by the same ratio (final/net) — preserving the existing
-- cascade split across multiple contracts/spot-overflow exactly as
-- record_contractual_delivery() decided it, just re-expressed in Final
-- Weight terms. A Rejected delivery is left untouched (its allocations
-- already never count anywhere per the existing `delivery_status <>
-- 'Rejected'` convention used throughout the app).
--
-- This is the single source of truth going forward — every existing
-- reader of delivery_allocations.allocated_weight_kg needs no further
-- code changes, since they already just read that column.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_final_weight_to_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mc            DECIMAL(5,2);
  v_rounded_mc    DECIMAL(4,1);
  v_discount_pct  DECIMAL(5,2) := 0;
  v_net_kg        DECIMAL(12,3);
  v_final_kg      DECIMAL(12,3);
  v_ratio         DECIMAL(14,8);
BEGIN
  -- Only Accepted deliveries are ever credited toward a contract/inventory —
  -- a Rejected delivery's allocations are already excluded everywhere by
  -- their delivery_status, so there is nothing to correct here.
  IF NEW.result <> 'Accepted' THEN
    RETURN NEW;
  END IF;

  SELECT moisture_content_pct INTO v_mc
  FROM public.laboratory_inspections
  WHERE inspection_id = NEW.inspection_id;

  SELECT net_weight_kg INTO v_net_kg
  FROM public.weighing_records
  WHERE delivery_id = NEW.delivery_id
  ORDER BY weighed_at DESC
  LIMIT 1;

  IF v_mc IS NULL OR v_net_kg IS NULL OR v_net_kg <= 0 THEN
    RETURN NEW;
  END IF;

  -- Same deterministic lookup convention used by InspectionQueuePage.jsx /
  -- PaymentsPage.jsx: MC <= 5.0cc -> 0% deduction; round to nearest 0.1cc
  -- and look up the literal PCA discount table; missing row -> 0% (never
  -- guessed/interpolated). MC > 20.2cc is an automatic Rejection handled
  -- above (result <> 'Accepted' already returns early).
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
  v_ratio    := v_final_kg / v_net_kg;

  -- Scale every allocation row for this delivery (across however many
  -- contracts + spot-overflow it was split into) down to Final Weight,
  -- preserving the existing proportional split decided at weighing time.
  UPDATE public.delivery_allocations
  SET    allocated_weight_kg = ROUND(allocated_weight_kg * v_ratio, 3)
  WHERE  delivery_id = NEW.delivery_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_final_weight_to_allocations ON public.quality_results;
CREATE TRIGGER trg_apply_final_weight_to_allocations
  AFTER INSERT ON public.quality_results
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_final_weight_to_allocations();

-- ------------------------------------------------------------
-- Backfill: correct every EXISTING Accepted delivery's allocations that
-- were inserted before this migration and are still sitting at Net
-- Weight. Runs the exact same math as the trigger above, one delivery at
-- a time, and is idempotent (re-running it does not re-apply the ratio a
-- second time because it always recomputes from the delivery's own
-- immutable Net Weight, never from the already-scaled allocation value).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_delivery RECORD;
  v_mc              DECIMAL(5,2);
  v_rounded_mc      DECIMAL(4,1);
  v_discount_pct    DECIMAL(5,2);
  v_net_kg          DECIMAL(12,3);
  v_final_kg        DECIMAL(12,3);
  v_ratio           DECIMAL(14,8);
  v_currently_alloc DECIMAL(12,3);
BEGIN
  FOR v_delivery IN
    SELECT d.delivery_id, li.moisture_content_pct AS mc, wr.net_weight_kg AS net_kg
    FROM public.deliveries d
    JOIN public.quality_results qr ON qr.delivery_id = d.delivery_id AND qr.result = 'Accepted'
    JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
    JOIN public.weighing_records wr ON wr.delivery_id = d.delivery_id
    WHERE d.delivery_status = 'Accepted'
  LOOP
    IF v_delivery.mc IS NULL OR v_delivery.net_kg IS NULL OR v_delivery.net_kg <= 0 THEN
      CONTINUE;
    END IF;

    IF v_delivery.mc <= 5.0 THEN
      v_discount_pct := 0;
    ELSE
      v_rounded_mc := ROUND(v_delivery.mc, 1);
      SELECT discount_value INTO v_discount_pct
      FROM public.pca_discount_table
      WHERE moisture_content_pct = v_rounded_mc;
      v_discount_pct := COALESCE(v_discount_pct, 0);
    END IF;

    v_net_kg   := v_delivery.net_kg;
    v_final_kg := GREATEST(0, v_net_kg * (1 - v_discount_pct / 100.0));

    -- Idempotency guard: if this delivery's allocations already sum to the
    -- expected Final Weight (within 0.01kg rounding tolerance) — because
    -- this backfill (or the live trigger) already corrected them — skip
    -- it. Without this check, re-running this migration would divide an
    -- already-corrected value by itself again and shrink it a second time.
    SELECT COALESCE(SUM(allocated_weight_kg), 0) INTO v_currently_alloc
    FROM public.delivery_allocations
    WHERE delivery_id = v_delivery.delivery_id;

    CONTINUE WHEN ABS(v_currently_alloc - v_final_kg) <= 0.01;

    v_ratio := v_final_kg / v_net_kg;

    UPDATE public.delivery_allocations
    SET    allocated_weight_kg = ROUND(allocated_weight_kg * v_ratio, 3)
    WHERE  delivery_id = v_delivery.delivery_id;
  END LOOP;
END;
$$;
