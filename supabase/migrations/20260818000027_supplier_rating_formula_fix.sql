-- ============================================================
-- Migration 027: Supplier Rating — align with §4.6.3 formula
-- ============================================================
-- Spec formula: Overall Performance Score = average of each
-- contract's weighted performance_score (%) across all of the
-- supplier's rated contracts. That average % is then converted
-- to the final 1-5 Supplier Rating via the band table
-- (90-100%→5, 70-89%→4, 50-69%→3, 30-49%→2, 0-29%→1).
--
-- Previous behavior averaged the already-rounded 1-5 per-contract
-- ratings directly, which is not what the spec describes and can
-- disagree with the band table (e.g. can produce non-integer,
-- non-band-consistent values like 3.5).
-- ============================================================

-- Store the averaged percentage explicitly; the final rating derived
-- from it is now a discrete 1-5 band, same as the per-contract rating.
ALTER TABLE public.supplier_performance_snapshot
  ADD COLUMN IF NOT EXISTS overall_performance_score DECIMAL(5,2);

ALTER TABLE public.supplier_performance_snapshot
  ALTER COLUMN overall_supplier_rating TYPE INTEGER USING ROUND(overall_supplier_rating)::INTEGER,
  ADD CONSTRAINT supplier_performance_snapshot_overall_rating_check
    CHECK (overall_supplier_rating BETWEEN 1 AND 5);

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
  v_overall_pct       DECIMAL(5,2);
  v_overall_rating    INTEGER;
  v_total_kg          DECIMAL(12,3);
  v_avg_moisture      DECIMAL(5,2);
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE contract_id = p_contract_id;

  -- Contract Fulfillment (60%): 100 if Completed, 0 if Breached
  v_fulfillment_score := CASE v_contract.status
    WHEN 'Completed' THEN 100.0
    WHEN 'Breached'  THEN   0.0
    ELSE 0.0
  END;

  -- Delivered Volume (20%): total net kg across accepted contractual deliveries
  SELECT COALESCE(SUM(wr.net_weight_kg), 0) INTO v_total_kg
  FROM public.deliveries d
  JOIN public.weighing_records wr ON wr.delivery_id = d.delivery_id
  WHERE d.contract_id = p_contract_id
    AND d.delivery_status = 'Accepted';

  v_volume_score := CASE
    WHEN v_total_kg >= 50000 THEN 100.0  -- ≥50 tons
    WHEN v_total_kg >= 40000 THEN  80.0
    WHEN v_total_kg >= 30000 THEN  60.0
    WHEN v_total_kg >= 20000 THEN  40.0
    ELSE                           20.0  -- ≤10 tons
  END;

  -- Copra Quality (20%): average moisture content of accepted deliveries
  SELECT COALESCE(AVG(li.moisture_content_pct), 0) INTO v_avg_moisture
  FROM public.deliveries d
  JOIN public.laboratory_inspections li ON li.delivery_id = d.delivery_id
  WHERE d.contract_id = p_contract_id
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

  -- §4.6.3: Overall Performance Score = average of performance_score (%)
  -- across ALL of this supplier's rated contracts, including this one.
  SELECT ROUND(
    (COALESCE(SUM(sps.performance_score), 0) + v_perf_score)
    / (COUNT(*) + 1), 2
  ) INTO v_overall_pct
  FROM public.supplier_performance_snapshot sps
  WHERE sps.supplier_id = v_contract.supplier_id;

  -- Convert the averaged % into the final 1-5 rating via the band table.
  v_overall_rating := CASE
    WHEN v_overall_pct >= 90 THEN 5
    WHEN v_overall_pct >= 70 THEN 4
    WHEN v_overall_pct >= 50 THEN 3
    WHEN v_overall_pct >= 30 THEN 2
    ELSE 1
  END;

  INSERT INTO public.supplier_performance_snapshot (
    supplier_id, contract_id, snapshot_date,
    contract_fulfillment_score, delivered_volume_score, copra_quality_score,
    performance_score, supplier_rating,
    overall_performance_score, overall_supplier_rating
  ) VALUES (
    v_contract.supplier_id, p_contract_id, CURRENT_DATE,
    v_fulfillment_score, v_volume_score, v_quality_score,
    v_perf_score, v_rating,
    v_overall_pct, v_overall_rating
  );
END;
$$;

-- ── Backfill existing snapshots so history matches the corrected formula ──
WITH running AS (
  SELECT snapshot_id,
         ROUND(AVG(performance_score) OVER (
           PARTITION BY supplier_id
           ORDER BY snapshot_date, snapshot_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ), 2) AS run_avg
  FROM public.supplier_performance_snapshot
)
UPDATE public.supplier_performance_snapshot sps
SET overall_performance_score = r.run_avg,
    overall_supplier_rating = CASE
      WHEN r.run_avg >= 90 THEN 5
      WHEN r.run_avg >= 70 THEN 4
      WHEN r.run_avg >= 50 THEN 3
      WHEN r.run_avg >= 30 THEN 2
      ELSE 1
    END
FROM running r
WHERE r.snapshot_id = sps.snapshot_id;