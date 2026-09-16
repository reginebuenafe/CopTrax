-- ============================================================
-- Migration 058: Breached contracts must score 0% Delivered Volume
--
-- Root cause: compute_supplier_rating() already forced Contract
-- Fulfillment to 0 for a Breached contract, but Delivered Volume was
-- still computed from the actual allocated kg and awarded partial
-- credit (20/40/60/80/100%) even though the contract was breached.
-- Per the official rating rubric, a Breached contract must earn
-- ZERO points from BOTH Contract Fulfillment and Delivered Volume —
-- only Copra Quality (moisture content in cc) remains independent
-- and is still calculated normally.
--
-- This migration:
--   1. Recreates compute_supplier_rating() so Delivered Volume is
--      forced to 0 whenever the contract is Breached (Copra Quality
--      untouched, Delivered Volume brackets for Completed contracts
--      unchanged).
--   2. Corrects existing snapshot rows for already-Breached contracts:
--      delivered_volume_score -> 0, performance_score and
--      supplier_rating recalculated from the corrected components.
--   3. Recomputes overall_supplier_rating as the running (cumulative)
--      average per supplier so the correction cascades to every
--      later snapshot, exactly like migration 054's recompute step.
-- ============================================================

-- 1. Recreate compute_supplier_rating() with the Breached-volume fix.
CREATE OR REPLACE FUNCTION public.compute_supplier_rating(p_contract_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract          RECORD;
  v_fulfillment_score DECIMAL(5,2);
  v_volume_score      DECIMAL(5,2);
  v_quality_score     DECIMAL(5,2);
  v_perf_score        DECIMAL(5,2);
  v_rating            INTEGER;
  v_overall           DECIMAL(3,2);
  v_total_kg          DECIMAL(12,3);
  v_avg_moisture      DECIMAL(5,2);
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE contract_id = p_contract_id;

  -- Contract Fulfillment (60%): 100 if Completed on/before due date, 0 if Breached
  v_fulfillment_score := CASE v_contract.status
    WHEN 'Completed' THEN 100.0
    WHEN 'Breached'  THEN   0.0
    ELSE 0.0
  END;

  -- Delivered Volume (20%): total allocated kg across accepted deliveries for this contract.
  -- Uses delivery_allocations so that overflow allocations are included.
  -- A Breached contract earns ZERO Delivered Volume credit regardless of how
  -- much was actually delivered before the deadline passed.
  IF v_contract.status = 'Breached' THEN
    v_volume_score := 0.0;
  ELSE
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0) INTO v_total_kg
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = p_contract_id
      AND d.delivery_status = 'Accepted';

    v_volume_score := CASE
      WHEN v_total_kg >= 50000 THEN 100.0  -- ≥50 tons
      WHEN v_total_kg >= 40000 THEN  80.0
      WHEN v_total_kg >= 30000 THEN  60.0
      WHEN v_total_kg >= 20000 THEN  40.0
      ELSE                           20.0  -- <20 tons
    END;
  END IF;

  -- Copra Quality (20%): average moisture content (cc) across accepted deliveries
  -- allocated to this contract. Independent of Breached/Completed status — a
  -- Breached contract still gets full credit for good copra quality.
  SELECT COALESCE(AVG(li.moisture_content_pct), 0) INTO v_avg_moisture
  FROM public.delivery_allocations da
  JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  JOIN public.laboratory_inspections li ON li.delivery_id = da.delivery_id
  WHERE da.contract_id = p_contract_id
    AND d.delivery_status = 'Accepted';

  v_quality_score := CASE
    WHEN v_avg_moisture  > 20.2 THEN   0.0  -- Rejected
    WHEN v_avg_moisture >= 10.5 THEN  20.0
    WHEN v_avg_moisture >=  9.5 THEN  40.0
    WHEN v_avg_moisture >=  8.5 THEN  60.0
    WHEN v_avg_moisture >=  7.5 THEN  80.0
    ELSE                              100.0  -- 5.0–7.4 cc
  END;

  v_perf_score := (v_fulfillment_score * 0.6)
                + (v_volume_score      * 0.2)
                + (v_quality_score     * 0.2);

  v_rating := CASE
    WHEN v_perf_score >= 90 THEN 5
    WHEN v_perf_score >= 70 THEN 4
    WHEN v_perf_score >= 50 THEN 3
    WHEN v_perf_score >= 30 THEN 2
    ELSE 1
  END;

  -- Overall rating = weighted average across all per-contract snapshots for this supplier
  SELECT ROUND(AVG(sps.supplier_rating), 2) INTO v_overall
  FROM public.supplier_performance_snapshot sps
  WHERE sps.supplier_id = v_contract.supplier_id;

  v_overall := ROUND(
    COALESCE(
      (v_overall * (SELECT COUNT(*) FROM public.supplier_performance_snapshot WHERE supplier_id = v_contract.supplier_id)
       + v_rating)
      / NULLIF((SELECT COUNT(*) FROM public.supplier_performance_snapshot WHERE supplier_id = v_contract.supplier_id) + 1, 0),
      v_rating
    ), 2
  );

  INSERT INTO public.supplier_performance_snapshot (
    supplier_id, contract_id, snapshot_date,
    contract_fulfillment_score, delivered_volume_score, copra_quality_score,
    performance_score, supplier_rating, overall_supplier_rating
  ) VALUES (
    v_contract.supplier_id, p_contract_id, CURRENT_DATE,
    v_fulfillment_score, v_volume_score, v_quality_score,
    v_perf_score, v_rating, v_overall
  );
END;
$$;

-- 2. Correct existing snapshot rows tied to a contract that is
--    currently Breached: zero out Delivered Volume and recompute
--    performance_score / supplier_rating from the corrected inputs.
--    Copra Quality is left untouched (already computed correctly).
WITH corrected AS (
  SELECT
    sps.snapshot_id,
    0.0::DECIMAL(5,2) AS new_volume_score,
    (sps.contract_fulfillment_score * 0.6
      + 0.0 * 0.2
      + sps.copra_quality_score * 0.2)::DECIMAL(5,2) AS new_perf_score
  FROM public.supplier_performance_snapshot sps
  JOIN public.contracts c ON c.contract_id = sps.contract_id
  WHERE c.status = 'Breached'
    AND sps.delivered_volume_score IS DISTINCT FROM 0.0
)
UPDATE public.supplier_performance_snapshot sps
SET delivered_volume_score = corrected.new_volume_score,
    performance_score      = corrected.new_perf_score,
    supplier_rating        = CASE
      WHEN corrected.new_perf_score >= 90 THEN 5
      WHEN corrected.new_perf_score >= 70 THEN 4
      WHEN corrected.new_perf_score >= 50 THEN 3
      WHEN corrected.new_perf_score >= 30 THEN 2
      ELSE 1
    END
FROM corrected
WHERE sps.snapshot_id = corrected.snapshot_id;

-- 3. Recompute overall_supplier_rating as the running (cumulative)
--    average per supplier now that corrected ratings may have changed,
--    so the fix cascades to every later snapshot (same pattern as
--    migration 054).
WITH ranked AS (
  SELECT
    snapshot_id,
    ROUND(
      AVG(supplier_rating) OVER (
        PARTITION BY supplier_id
        ORDER BY snapshot_date ASC, snapshot_id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ), 2
    ) AS running_avg
  FROM public.supplier_performance_snapshot
)
UPDATE public.supplier_performance_snapshot sps
SET overall_supplier_rating = ranked.running_avg
FROM ranked
WHERE sps.snapshot_id = ranked.snapshot_id;
