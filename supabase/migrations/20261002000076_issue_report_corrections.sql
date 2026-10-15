-- ============================================================
-- Migration: Weight/MC "Report Issue" → correction workflow
--
-- Extends (does not replace) the existing delivery_issue_reports system
-- (migrations 047/048) so Weighing Staff and Laboratory Staff report a
-- SPECIFIC, typed correction request — with required photographic
-- evidence — instead of a free-text-only note, and the Business Owner
-- can review that evidence and apply the correction, which cascades
-- through the exact same recalculation path already used for Final
-- Weight (recompute_delivery_allocation(), migration 066) rather than a
-- new, parallel formula.
-- ============================================================

-- ── 1. Extend delivery_issue_reports ──────────────────────────────────────
ALTER TABLE public.delivery_issue_reports
  ADD COLUMN IF NOT EXISTS issue_type TEXT NOT NULL DEFAULT 'General'
    CHECK (issue_type IN ('Weight Correction', 'MC Correction', 'General')),
  ADD COLUMN IF NOT EXISTS evidence_photo_1_file_id UUID REFERENCES public.file_uploads(file_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_photo_2_file_id UUID REFERENCES public.file_uploads(file_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_removed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.delivery_issue_reports.issue_type IS
  'Weight Correction (Weigher) | MC Correction (Lab Staff) | General (legacy free-text reports predating this column).';
COMMENT ON COLUMN public.delivery_issue_reports.evidence_photo_1_file_id IS
  'Weight Correction: photo of the correct weight on the scale/display. MC Correction: photo of the apparatus reading.';
COMMENT ON COLUMN public.delivery_issue_reports.evidence_photo_2_file_id IS
  'Photo of the paper receipt/slip showing the correct recorded value.';
COMMENT ON COLUMN public.delivery_issue_reports.evidence_removed_at IS
  'Set once evidence photos have been deleted from Storage after resolution (storage cost cleanup). The text audit trail in delivery_corrections is NOT affected by this.';

-- Tighten the INSERT policy: a Weigher may only submit a 'Weight
-- Correction', Laboratory Staff only an 'MC Correction'. ('General' is no
-- longer insertable by either role going forward — it only still exists
-- to classify pre-existing rows created before this migration.)
DROP POLICY IF EXISTS "delivery_issue_reports_insert" ON public.delivery_issue_reports;
CREATE POLICY "delivery_issue_reports_insert" ON public.delivery_issue_reports
  FOR INSERT WITH CHECK (
    reported_by = auth.uid()
    AND (
      (public.get_my_role() = 'Weigher' AND issue_type = 'Weight Correction')
      OR (public.get_my_role() = 'Laboratory Staff' AND issue_type = 'MC Correction')
    )
  );

-- The existing BO/Lab-only UPDATE policy already covers status changes
-- (e.g. the legacy plain "Resolve" action on General issues). Weight/MC
-- Correction issues are resolved exclusively through
-- apply_delivery_correction() below (SECURITY DEFINER, explicit BO check),
-- not through a raw client UPDATE — so no policy change is needed there.

-- ── 2. Permanent, lightweight correction audit trail ──────────────────────
-- Deliberately a separate, minimal table so it survives independently of
-- the issue report's evidence photos (which get deleted after resolution)
-- and of the issue report row itself if that were ever removed.
CREATE TABLE IF NOT EXISTS public.delivery_corrections (
  correction_id    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_report_id  UUID REFERENCES public.delivery_issue_reports(issue_report_id) ON DELETE SET NULL,
  delivery_id      UUID NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
  issue_type       TEXT NOT NULL CHECK (issue_type IN ('Weight Correction', 'MC Correction')),
  old_value        DECIMAL(12,3) NOT NULL,
  corrected_value  DECIMAL(12,3) NOT NULL,
  submitted_by     UUID REFERENCES public.users(user_id),
  resolved_by      UUID NOT NULL REFERENCES public.users(user_id),
  date_reported    TIMESTAMPTZ NOT NULL,
  date_resolved    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_corrections_select" ON public.delivery_corrections;
CREATE POLICY "delivery_corrections_select" ON public.delivery_corrections
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

-- No client-facing INSERT/UPDATE/DELETE policy — rows are only ever
-- written by apply_delivery_correction() below.

-- ── 3. apply_delivery_correction() ────────────────────────────────────────
-- The ONLY path that can change a recorded weight or moisture-content
-- value after the fact. Re-validates the caller is the Business Owner,
-- loads the issue report (must exist, must not already be Resolved),
-- applies the correction, and reuses recompute_delivery_allocation()
-- (migration 20260917000066) — the existing, already-correct Final-Weight
-- cascade engine — instead of re-deriving a parallel formula. Also keeps
-- inventory_batches.weight_kg and, where safe, any still-Pending (not yet
-- Processing/Released) payment_details in sync, then writes the permanent
-- audit row and marks the issue Resolved — all inside one transaction.
CREATE OR REPLACE FUNCTION public.apply_delivery_correction(
  p_issue_report_id UUID,
  p_corrected_value NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue              public.delivery_issue_reports;
  v_delivery           public.deliveries;
  v_old_value          NUMERIC;
  v_weighing_id        UUID;
  v_inspection_id      UUID;
  v_quality_id         UUID;
  v_quality_result     public.quality_result_enum;
  v_current_mc         NUMERIC;
  v_rounded_mc         DECIMAL(4,1);
  v_discount_pct       NUMERIC := 0;
  v_new_final_kg       NUMERIC;
  v_payment_id         UUID;
  v_payment_status     TEXT;
  v_payment_note       TEXT := NULL;
  v_result_json        JSONB;
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
  IF v_issue.issue_type NOT IN ('Weight Correction', 'MC Correction') THEN
    RAISE EXCEPTION 'This issue type does not support a direct correction' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery FROM public.deliveries WHERE delivery_id = v_issue.delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_corrected_value IS NULL OR p_corrected_value <= 0 THEN
    RAISE EXCEPTION 'Corrected value must be greater than zero' USING ERRCODE = '22023';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  IF v_issue.issue_type = 'Weight Correction' THEN
    SELECT weighing_id, net_weight_kg INTO v_weighing_id, v_old_value
    FROM public.weighing_records
    WHERE delivery_id = v_delivery.delivery_id
    ORDER BY weighed_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No weighing record found for this delivery' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.weighing_records SET net_weight_kg = p_corrected_value WHERE weighing_id = v_weighing_id;

    IF v_delivery.delivery_source = 'Contract-based' THEN
      -- Reuses the existing Final-Weight cascade engine: it reads the
      -- (now-corrected) Net Weight + current MC fresh from the DB, so
      -- correcting weighing_records above is all that's needed for it to
      -- recompute the right split.
      PERFORM public.recompute_delivery_allocation(v_delivery.delivery_id);

      v_new_final_kg := (
        SELECT COALESCE(SUM(allocated_weight_kg), 0)
        FROM public.delivery_allocations
        WHERE delivery_id = v_delivery.delivery_id
      );

      UPDATE public.inventory_batches
      SET weight_kg = v_new_final_kg
      WHERE delivery_id = v_delivery.delivery_id;
    ELSE
      -- Walk-in: weighing_records.net_weight_kg already IS the final
      -- payable weight (post sacks/wet deduction) per WalkinDeliveryForm —
      -- there is no separate lab/PCA step to recompute.
      v_new_final_kg := p_corrected_value;

      UPDATE public.deliveries
      SET walkin_amount_paid = ROUND(v_new_final_kg * walkin_spot_price_kg, 2)
      WHERE delivery_id = v_delivery.delivery_id;

      UPDATE public.inventory_batches
      SET weight_kg = v_new_final_kg
      WHERE delivery_id = v_delivery.delivery_id;
    END IF;

  -- ──────────────────────────────────────────────────────────────────────
  ELSIF v_issue.issue_type = 'MC Correction' THEN
    -- MC Correction only ever applies to Contract-based deliveries — Lab
    -- Staff never assesses Walk-in deliveries (InspectionQueuePage.jsx
    -- only ever queues Contract-based, 'Weighed' deliveries).
    IF v_delivery.delivery_source <> 'Contract-based' THEN
      RAISE EXCEPTION 'MC Correction only applies to contractual deliveries' USING ERRCODE = '22023';
    END IF;

    IF p_corrected_value > 20.2 THEN
      RAISE EXCEPTION 'A corrected MC above 20.2cc would reject this delivery. This correction flow only supports values that keep the delivery Accepted.' USING ERRCODE = '22023';
    END IF;

    SELECT qr.quality_id, qr.inspection_id, li.moisture_content_pct, qr.result
    INTO v_quality_id, v_inspection_id, v_current_mc, v_quality_result
    FROM public.quality_results qr
    JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
    WHERE qr.delivery_id = v_delivery.delivery_id
    ORDER BY qr.evaluated_at DESC
    LIMIT 1
    FOR UPDATE OF qr;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No quality result found for this delivery' USING ERRCODE = 'P0002';
    END IF;

    IF v_quality_result <> 'Accepted' THEN
      RAISE EXCEPTION 'This delivery is currently Rejected. This correction flow only supports adjusting the MC of an Accepted delivery — reversing a rejection requires a separate, more involved workflow.' USING ERRCODE = '22023';
    END IF;

    v_old_value := v_current_mc;

    UPDATE public.laboratory_inspections SET moisture_content_pct = p_corrected_value WHERE inspection_id = v_inspection_id;

    -- Same deterministic PCA lookup convention used everywhere else
    -- (InspectionQueuePage.jsx, recompute_delivery_allocation()): MC < 5.0
    -- → 0%, else round to nearest 0.1 and look up the table, default 0%.
    IF p_corrected_value < 5.0 THEN
      v_discount_pct := 0;
    ELSE
      v_rounded_mc := ROUND(p_corrected_value, 1);
      SELECT discount_value INTO v_discount_pct FROM public.pca_discount_table WHERE moisture_content_pct = v_rounded_mc;
      v_discount_pct := COALESCE(v_discount_pct, 0);
    END IF;

    UPDATE public.quality_results
    SET remarks = 'Moisture content ' || p_corrected_value || 'cc. Deduction: ' || v_discount_pct || '%. (Corrected by Business Owner.)'
    WHERE quality_id = v_quality_id;

    PERFORM public.recompute_delivery_allocation(v_delivery.delivery_id);

    v_new_final_kg := (
      SELECT COALESCE(SUM(allocated_weight_kg), 0)
      FROM public.delivery_allocations
      WHERE delivery_id = v_delivery.delivery_id
    );

    UPDATE public.inventory_batches
    SET weight_kg = v_new_final_kg
    WHERE delivery_id = v_delivery.delivery_id;
  END IF;

  -- ── Keep a still-Pending payment in sync (money not yet sent) ─────────
  -- A delivery is batched as a whole (create_payment_batch inserts every
  -- allocation line for it into ONE payment), so at most one payment_id
  -- is expected here in practice.
  IF v_delivery.delivery_source = 'Contract-based' THEN
    SELECT DISTINCT pd.payment_id INTO v_payment_id
    FROM public.payment_details pd
    WHERE pd.delivery_id = v_delivery.delivery_id
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      SELECT payment_status INTO v_payment_status FROM public.payments WHERE payment_id = v_payment_id FOR UPDATE;

      IF v_payment_status = 'Pending' THEN
        -- Current MC (freshly re-read — correct whether this was a Weight
        -- Correction, which leaves MC unchanged, or an MC Correction,
        -- which already updated it above) drives the same deterministic
        -- PCA lookup used everywhere else, so each allocation line's
        -- informational Net/Deducted figures reverse-derive consistently
        -- with computeLine()'s convention on the Payments page.
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

  -- ── Permanent audit trail ───────────────────────────────────────────────
  INSERT INTO public.delivery_corrections (
    issue_report_id, delivery_id, issue_type, old_value, corrected_value,
    submitted_by, resolved_by, date_reported
  ) VALUES (
    p_issue_report_id, v_delivery.delivery_id, v_issue.issue_type, v_old_value, p_corrected_value,
    v_issue.reported_by, auth.uid(), v_issue.created_at
  );

  UPDATE public.delivery_issue_reports
  SET status = 'Resolved', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE issue_report_id = p_issue_report_id;

  v_result_json := jsonb_build_object(
    'old_value', v_old_value,
    'corrected_value', p_corrected_value,
    'payment_note', v_payment_note
  );
  RETURN v_result_json;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_delivery_correction(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_delivery_correction(UUID, NUMERIC) TO authenticated;

-- ── 4. clear_issue_evidence() ──────────────────────────────────────────────
-- Best-effort-retryable second step: called by the client ONLY after it has
-- confirmed the Storage objects were actually deleted. Deletes the
-- file_uploads rows (ON DELETE SET NULL auto-clears the two FK columns on
-- delivery_issue_reports) and stamps evidence_removed_at. Deliberately a
-- separate call from apply_delivery_correction() so a Storage failure can
-- never roll back an already-committed correction, and so this step is
-- safely retryable on its own (it only proceeds while file ids still exist).
CREATE OR REPLACE FUNCTION public.clear_issue_evidence(p_issue_report_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue public.delivery_issue_reports;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can clear issue evidence' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_issue FROM public.delivery_issue_reports WHERE issue_report_id = p_issue_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue report not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.status <> 'Resolved' THEN
    RAISE EXCEPTION 'Evidence can only be cleared after the issue is Resolved' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.file_uploads
  WHERE file_id IN (v_issue.evidence_photo_1_file_id, v_issue.evidence_photo_2_file_id);

  UPDATE public.delivery_issue_reports
  SET evidence_removed_at = NOW()
  WHERE issue_report_id = p_issue_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_issue_evidence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_issue_evidence(UUID) TO authenticated;
