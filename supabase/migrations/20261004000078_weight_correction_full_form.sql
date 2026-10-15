-- ============================================================
-- Migration: Business Owner Weight Correction now uses the FULL Weigher
-- weighing form instead of a single "Corrected Weight (kg)" field.
--
-- apply_delivery_correction() (migration 20261002000076) is left
-- completely unchanged and still handles MC Correction. This migration
-- adds a sibling function, apply_weight_correction(), used ONLY for
-- 'Weight Correction' issues, accepting the same fields the Weigher
-- actually enters at weighing time (Contractual: delivery date, truck
-- plate, gross/tare weight; Walk-in: delivery date, gross weight, number
-- of sacks, condition) and applying the exact same calculations already
-- used by ContractualDeliveryForm.jsx / WalkinDeliveryForm.jsx, instead of
-- a new parallel formula. It then reuses recompute_delivery_allocation()
-- (migration 20260917000066) exactly as apply_delivery_correction() does.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_weight_correction(
  p_issue_report_id UUID,
  p_delivery_date   DATE,
  p_truck_plate     TEXT,
  p_gross_kg        NUMERIC,
  p_tare_kg         NUMERIC,
  p_num_sacks       INTEGER,
  p_condition       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue           public.delivery_issue_reports;
  v_delivery        public.deliveries;
  v_weighing_id     UUID;
  v_old_net_kg      NUMERIC;
  v_new_net_kg      NUMERIC;
  v_new_final_kg    NUMERIC;
  v_sacks_deduction NUMERIC := 0;
  v_wet_deduction   NUMERIC := 0;
  v_payment_id      UUID;
  v_payment_status  TEXT;
  v_payment_note    TEXT := NULL;
  v_current_mc      NUMERIC;
  v_rounded_mc      DECIMAL(4,1);
  v_discount_pct    NUMERIC := 0;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can apply a correction' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_issue FROM public.delivery_issue_reports WHERE issue_report_id = p_issue_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue report not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.status = 'Resolved' THEN
    RAISE EXCEPTION 'This issue has already been resolved' USING ERRCODE = '22023';
  END IF;
  IF v_issue.issue_type <> 'Weight Correction' THEN
    RAISE EXCEPTION 'This function only applies to Weight Correction issues' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery FROM public.deliveries WHERE delivery_id = v_issue.delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Delivery date is required' USING ERRCODE = '22023';
  END IF;
  IF p_gross_kg IS NULL OR p_gross_kg <= 0 THEN
    RAISE EXCEPTION 'Gross weight must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT weighing_id, net_weight_kg INTO v_weighing_id, v_old_net_kg
  FROM public.weighing_records
  WHERE delivery_id = v_delivery.delivery_id
  ORDER BY weighed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No weighing record found for this delivery' USING ERRCODE = 'P0002';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  IF v_delivery.delivery_source = 'Contract-based' THEN
    -- Mirrors ContractualDeliveryForm.jsx's validateForm() exactly.
    IF p_tare_kg IS NULL OR p_tare_kg < 0 THEN
      RAISE EXCEPTION 'Tare weight cannot be negative' USING ERRCODE = '22023';
    END IF;
    IF p_tare_kg >= p_gross_kg THEN
      RAISE EXCEPTION 'Tare weight must be less than gross weight' USING ERRCODE = '22023';
    END IF;

    v_new_net_kg := p_gross_kg - p_tare_kg;

    UPDATE public.weighing_records
    SET gross_weight_kg = p_gross_kg,
        tare_weight_kg  = p_tare_kg,
        net_weight_kg   = v_new_net_kg
    WHERE weighing_id = v_weighing_id;

    UPDATE public.deliveries
    SET delivery_date      = p_delivery_date,
        truck_plate_number = NULLIF(TRIM(p_truck_plate), '')
    WHERE delivery_id = v_delivery.delivery_id;

    -- Reuses the existing Final-Weight cascade engine: it reads the
    -- (now-corrected) Net Weight + current MC fresh from the DB, so
    -- correcting the weight recomputes the right split.
    PERFORM public.recompute_delivery_allocation(v_delivery.delivery_id);

    v_new_final_kg := (
      SELECT COALESCE(SUM(allocated_weight_kg), 0)
      FROM public.delivery_allocations
      WHERE delivery_id = v_delivery.delivery_id
    );

    UPDATE public.inventory_batches
    SET weight_kg = v_new_final_kg
    WHERE delivery_id = v_delivery.delivery_id;

  -- ──────────────────────────────────────────────────────────────────────
  ELSE
    -- Walk-in: mirrors WalkinDeliveryForm.jsx's weight computation exactly
    -- (entered weight IS the gross weight; sacks deduction = num_sacks / 2;
    -- wet deduction = 10% of gross when Condition = 'Wet'). There is no
    -- separate lab/PCA step for Walk-in, so the resulting final weight IS
    -- the new net_weight_kg stored on weighing_records.
    IF p_num_sacks IS NULL OR p_num_sacks <= 0 THEN
      RAISE EXCEPTION 'Number of sacks must be greater than zero' USING ERRCODE = '22023';
    END IF;
    IF p_condition IS NULL OR p_condition NOT IN ('Dry', 'Wet') THEN
      RAISE EXCEPTION 'Condition must be Dry or Wet' USING ERRCODE = '22023';
    END IF;

    v_sacks_deduction := p_num_sacks / 2.0;
    v_wet_deduction   := CASE WHEN p_condition = 'Wet' THEN p_gross_kg * 0.10 ELSE 0 END;
    v_new_final_kg    := GREATEST(GREATEST(p_gross_kg - v_sacks_deduction, 0) - v_wet_deduction, 0);
    v_new_net_kg      := v_new_final_kg; -- Walk-in has no separate PCA step: net = final.

    UPDATE public.weighing_records
    SET gross_weight_kg = p_gross_kg,
        tare_weight_kg  = v_sacks_deduction,
        net_weight_kg   = v_new_final_kg,
        copra_condition = p_condition,
        num_sacks       = p_num_sacks
    WHERE weighing_id = v_weighing_id;

    UPDATE public.deliveries
    SET delivery_date      = p_delivery_date,
        walkin_amount_paid = ROUND(v_new_final_kg * walkin_spot_price_kg, 2)
    WHERE delivery_id = v_delivery.delivery_id;

    UPDATE public.inventory_batches
    SET weight_kg = v_new_final_kg
    WHERE delivery_id = v_delivery.delivery_id;
  END IF;

  -- ── Keep a still-Pending payment in sync (money not yet sent) ─────────
  -- Identical logic/comments to apply_delivery_correction() (migration
  -- 20261002000076) — only ever applies to Contract-based deliveries.
  IF v_delivery.delivery_source = 'Contract-based' THEN
    SELECT DISTINCT pd.payment_id INTO v_payment_id
    FROM public.payment_details pd
    WHERE pd.delivery_id = v_delivery.delivery_id
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      SELECT payment_status INTO v_payment_status FROM public.payments WHERE payment_id = v_payment_id FOR UPDATE;

      IF v_payment_status = 'Pending' THEN
        SELECT li.moisture_content_pct INTO v_current_mc
        FROM public.quality_results qr
        JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
        WHERE qr.delivery_id = v_delivery.delivery_id
        ORDER BY qr.evaluated_at DESC
        LIMIT 1;

        IF v_current_mc < 5.0 THEN
          v_discount_pct := 0;
        ELSE
          v_rounded_mc := ROUND(v_current_mc, 1);
          SELECT discount_value INTO v_discount_pct FROM public.pca_discount_table WHERE moisture_content_pct = v_rounded_mc;
          v_discount_pct := COALESCE(v_discount_pct, 0);
        END IF;

        DELETE FROM public.payment_details WHERE payment_id = v_payment_id AND delivery_id = v_delivery.delivery_id;

        INSERT INTO public.payment_details (
          payment_id, delivery_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
          moisture_content_pct, moisture_deduction_kg, final_weight_kg,
          price_type, price_per_kg_used, pca_discount_amount, line_amount
        )
        SELECT
          v_payment_id,
          v_delivery.delivery_id,
          alloc_net_kg,
          0,
          alloc_net_kg,
          v_current_mc,
          GREATEST(0, alloc_net_kg - da.allocated_weight_kg),
          da.allocated_weight_kg,
          da.price_type,
          price_used,
          GREATEST(0, alloc_net_kg - da.allocated_weight_kg),
          ROUND(da.allocated_weight_kg * price_used, 2)
        FROM public.delivery_allocations da
        CROSS JOIN LATERAL (
          SELECT CASE WHEN v_discount_pct < 100
            THEN da.allocated_weight_kg / (1 - v_discount_pct / 100.0)
            ELSE da.allocated_weight_kg END AS alloc_net_kg
        ) net_calc
        CROSS JOIN LATERAL (
          SELECT CASE WHEN da.contract_id IS NOT NULL
            THEN (SELECT negotiated_price_per_kg FROM public.contracts WHERE contract_id = da.contract_id)
            ELSE (SELECT price_per_kg FROM public.spot_price ORDER BY updated_at DESC LIMIT 1)
          END AS price_used
        ) price_calc
        WHERE da.delivery_id = v_delivery.delivery_id;

        UPDATE public.payments
        SET total_amount = (SELECT COALESCE(SUM(line_amount), 0) FROM public.payment_details WHERE payment_id = v_payment_id)
        WHERE payment_id = v_payment_id;
      ELSE
        v_payment_note := 'This delivery''s payment is already ' || v_payment_status || '; the financial record was not altered.';
      END IF;
    END IF;
  END IF;

  -- ── Permanent audit trail (same table/shape as apply_delivery_correction) ─
  -- Both sides are expressed in Net Weight terms (pre-PCA-deduction for
  -- Contract-based, which IS the final payable weight for Walk-in) so the
  -- comparison is apples-to-apples — never the pre-deduction Net Weight
  -- against the post-deduction allocated Final Weight.
  INSERT INTO public.delivery_corrections (
    issue_report_id, delivery_id, issue_type, old_value, corrected_value,
    submitted_by, resolved_by, date_reported
  ) VALUES (
    p_issue_report_id, v_delivery.delivery_id, v_issue.issue_type, v_old_net_kg, v_new_net_kg,
    v_issue.reported_by, auth.uid(), v_issue.created_at
  );

  UPDATE public.delivery_issue_reports
  SET status = 'Resolved', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE issue_report_id = p_issue_report_id;

  RETURN jsonb_build_object(
    'old_value', v_old_net_kg,
    'corrected_value', v_new_net_kg,
    'payment_note', v_payment_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_weight_correction(UUID, DATE, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_weight_correction(UUID, DATE, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT) TO authenticated;
