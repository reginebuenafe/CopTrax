-- Fix compute_supplier_rating to read delivered volume and quality from
-- delivery_allocations instead of deliveries.contract_id directly.
-- This ensures overflow/cascaded multi-contract deliveries are counted correctly.

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
    ELSE                           20.0  -- ≤10 tons
  END;

  -- Copra Quality (20%): average moisture content across accepted deliveries allocated to this contract.
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
    ELSE                              100.0  -- 6.5–7.4%
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
