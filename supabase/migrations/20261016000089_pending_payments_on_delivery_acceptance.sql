-- REVIEW STEP: create payment records when contractual deliveries become payable.
-- No table/column, RLS, contract lifecycle, or payout/release changes.
-- Uses the existing create_payment_batch writer, including its supplier notice.
-- Applying this migration also backfills eligible unpaid deliveries. These are
-- real Pending batches and the existing Friday auto-release job can pick them up.
BEGIN;

-- Mirror PaymentsPage.computeLine and getPaymentFriday. Allocations already
-- contain FINAL weight: never apply the PCA deduction a second time. Spot
-- pricing uses the same current spot-price source as the BO batch calculation.
-- Internal only; this function is not exposed to application roles.
CREATE OR REPLACE FUNCTION public.payable_delivery_payment_lines(p_supplier_id UUID)
RETURNS TABLE (
  delivery_id UUID, business_owner_id UUID, payment_week DATE,
  sequence_order INTEGER, gross_weight_kg NUMERIC, tare_weight_kg NUMERIC,
  net_weight_kg NUMERIC, moisture_content_pct NUMERIC,
  moisture_deduction_kg NUMERIC, final_weight_kg NUMERIC,
  price_type public.price_type_enum, price_per_kg_used NUMERIC,
  pca_discount_amount NUMERIC, line_amount NUMERIC, unrounded_amount DOUBLE PRECISION
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.delivery_id, owner.business_owner_id,
    (ph.recorded_at::date
      + ((5 - extract(dow FROM ph.recorded_at)::int + 7) % 7)
      + CASE WHEN extract(dow FROM ph.recorded_at) = 5
          AND (extract(hour FROM ph.recorded_at) > 17
            OR (extract(hour FROM ph.recorded_at) = 17 AND extract(minute FROM ph.recorded_at) > 0))
        THEN 7 ELSE 0 END)::date,
    da.sequence_order, wr.gross_weight_kg, wr.tare_weight_kg,
    weights.net_kg, li.moisture_content_pct,
    weights.net_kg - da.allocated_weight_kg, da.allocated_weight_kg,
    CASE WHEN da.contract_id IS NULL THEN 'Spot' ELSE 'Negotiated' END::public.price_type_enum,
    price.per_kg, weights.net_kg - da.allocated_weight_kg,
    -- Match the BO's Number multiplication and Math.round(x * 100) / 100,
    -- including its floating-point cent rounding, rather than changing amounts.
    (floor((da.allocated_weight_kg::double precision * price.per_kg::double precision) * 100 + 0.5) / 100)::numeric,
    da.allocated_weight_kg::double precision * price.per_kg::double precision
  FROM public.deliveries d
  JOIN LATERAL (
    SELECT w.* FROM public.weighing_records w WHERE w.delivery_id = d.delivery_id
    ORDER BY w.weighed_at DESC, w.weighing_id DESC LIMIT 1
  ) wr ON true
  JOIN LATERAL (
    SELECT q.* FROM public.quality_results q WHERE q.delivery_id = d.delivery_id
    ORDER BY q.evaluated_at DESC, q.quality_id DESC LIMIT 1
  ) qr ON qr.result = 'Accepted'
  JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
  JOIN public.delivery_allocations da ON da.delivery_id = d.delivery_id
  LEFT JOIN public.contracts c ON c.contract_id = da.contract_id
  CROSS JOIN LATERAL (SELECT d.created_at AT TIME ZONE 'Asia/Manila' AS recorded_at) ph
  CROSS JOIN LATERAL (
    SELECT coalesce(
      (SELECT pc.business_owner_id FROM public.contracts pc WHERE pc.contract_id = d.contract_id),
      (SELECT ac.business_owner_id FROM public.delivery_allocations a
       JOIN public.contracts ac ON ac.contract_id = a.contract_id
       WHERE a.delivery_id = d.delivery_id ORDER BY a.sequence_order LIMIT 1),
      -- Same single active BO convention used elsewhere for spot-only overflow.
      (SELECT u.user_id FROM public.users u JOIN public.roles r ON r.role_id = u.role_id
       WHERE r.role_name = 'Business Owner' AND u.account_status = 'Active'
       ORDER BY u.created_at, u.user_id LIMIT 1)
    ) AS business_owner_id
  ) owner
  CROSS JOIN LATERAL (
    SELECT coalesce((regexp_match(coalesce(qr.remarks, ''), '(?:Discount|Deduction):\s*([\d.]+)%'))[1]::numeric, 0) AS pct
  ) discount
  CROSS JOIN LATERAL (
    SELECT CASE WHEN discount.pct < 100
      THEN da.allocated_weight_kg / (1 - discount.pct / 100)
      ELSE da.allocated_weight_kg END AS net_kg
  ) weights
  CROSS JOIN LATERAL (
    SELECT CASE WHEN da.contract_id IS NOT NULL THEN coalesce(c.negotiated_price_per_kg, 0)
      ELSE coalesce((SELECT s.price_per_kg FROM public.spot_price s LIMIT 1), 0) END AS per_kg
  ) price
  WHERE d.delivery_source = 'Contract-based' AND d.delivery_status = 'Accepted'
    AND d.supplier_id IS NOT NULL AND owner.business_owner_id IS NOT NULL
    AND (p_supplier_id IS NULL OR d.supplier_id = p_supplier_id)
    AND d.payment_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.payment_details pd WHERE pd.delivery_id = d.delivery_id);
$$;

REVOKE ALL ON FUNCTION public.payable_delivery_payment_lines(UUID) FROM PUBLIC, anon, authenticated;

-- A physical delivery may have several allocation lines in ONE payment, so a
-- UNIQUE(payment_details.delivery_id) constraint would be incorrect. Serialize
-- on the existing delivery reference and reject a second payment instead. This
-- also rejects stale/manual batch submissions without changing the BO action.
CREATE OR REPLACE FUNCTION public.guard_delivery_single_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_payment_id UUID;
BEGIN
  SELECT d.payment_id INTO v_payment_id FROM public.deliveries d
    WHERE d.delivery_id = NEW.delivery_id FOR UPDATE;
  IF (v_payment_id IS NOT NULL AND v_payment_id <> NEW.payment_id)
    OR EXISTS (SELECT 1 FROM public.payment_details pd
      WHERE pd.delivery_id = NEW.delivery_id AND pd.payment_id <> NEW.payment_id) THEN
    RAISE EXCEPTION 'This delivery already belongs to another payment. Refresh the payment list.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_delivery_single_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_delivery_single_payment ON public.payment_details;
CREATE TRIGGER guard_delivery_single_payment
  BEFORE INSERT OR UPDATE OF payment_id, delivery_id ON public.payment_details
  FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_single_payment();

CREATE OR REPLACE FUNCTION public.ensure_pending_delivery_payment(p_delivery_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries%ROWTYPE;
  v_owner_id UUID;
  v_week DATE;
  v_ids UUID[];
  v_details JSONB;
  v_total NUMERIC;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_delivery FROM public.deliveries d WHERE d.delivery_id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_delivery.payment_id IS NOT NULL THEN RETURN v_delivery.payment_id; END IF;

  SELECT l.business_owner_id, l.payment_week INTO v_owner_id, v_week
    FROM public.payable_delivery_payment_lines(v_delivery.supplier_id) l
    WHERE l.delivery_id = p_delivery_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pending-payment:' || v_delivery.supplier_id || ':' || v_owner_id || ':' || v_week, 0));

  -- Preserve BO grouping by supplier, owner and payment Friday. Skip another
  -- transaction's locked delivery; its acceptance will create its own batch.
  -- Never merge into or recalculate an existing Pending/Processing/paid batch.
  SELECT array_agg(available.delivery_id) INTO v_ids FROM (
    SELECT d.delivery_id FROM public.deliveries d
    WHERE d.supplier_id = v_delivery.supplier_id AND EXISTS (
      SELECT 1 FROM public.payable_delivery_payment_lines(v_delivery.supplier_id) l
      WHERE l.delivery_id = d.delivery_id AND l.business_owner_id = v_owner_id AND l.payment_week = v_week
    )
    ORDER BY d.delivery_id FOR UPDATE OF d SKIP LOCKED
  ) available;

  SELECT jsonb_agg(jsonb_build_object(
      'delivery_id', l.delivery_id, 'gross_weight_kg', l.gross_weight_kg,
      'tare_weight_kg', l.tare_weight_kg, 'net_weight_kg', l.net_weight_kg,
      'moisture_content_pct', l.moisture_content_pct, 'moisture_deduction_kg', l.moisture_deduction_kg,
      'final_weight_kg', l.final_weight_kg, 'price_type', l.price_type,
      'price_per_kg_used', l.price_per_kg_used, 'pca_discount_amount', l.pca_discount_amount,
      'line_amount', l.line_amount
    ) ORDER BY l.delivery_id, l.sequence_order),
    (floor(sum(l.unrounded_amount ORDER BY l.delivery_id, l.sequence_order) * 100 + 0.5) / 100)::numeric
    INTO v_details, v_total
    FROM public.payable_delivery_payment_lines(v_delivery.supplier_id) l
    WHERE l.delivery_id = ANY(v_ids) AND l.business_owner_id = v_owner_id AND l.payment_week = v_week;
  IF v_details IS NULL THEN RETURN NULL; END IF;

  v_payment_id := public.create_payment_batch(
    v_delivery.supplier_id, v_owner_id, v_week, v_total,
    'A payment of ₱' || to_char(v_total, 'FM999999999999990.00') || ' for ' || cardinality(v_ids)
      || ' delivery(ies) is ready for release on ' || to_char(v_week, 'Mon DD, YYYY') || '.',
    v_details
  );
  RETURN v_payment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_pending_delivery_payment(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_pending_payment_on_acceptance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_pending_delivery_payment(NEW.delivery_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_pending_payment_on_acceptance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_pending_payment_on_delivery_acceptance ON public.deliveries;
CREATE TRIGGER zz_pending_payment_on_delivery_acceptance
  AFTER UPDATE OF delivery_status ON public.deliveries
  FOR EACH ROW WHEN (NEW.delivery_source = 'Contract-based' AND NEW.delivery_status = 'Accepted'
    AND OLD.delivery_status IS DISTINCT FROM NEW.delivery_status)
  EXECUTE FUNCTION public.create_pending_payment_on_acceptance();

-- Also handles quality results arriving after the status update. Alphabetic
-- trigger order puts this after the existing final-weight allocation trigger.
DROP TRIGGER IF EXISTS zz_pending_payment_on_quality_acceptance ON public.quality_results;
CREATE TRIGGER zz_pending_payment_on_quality_acceptance
  AFTER INSERT OR UPDATE OF result ON public.quality_results
  FOR EACH ROW WHEN (NEW.result = 'Accepted')
  EXECUTE FUNCTION public.create_pending_payment_on_acceptance();

-- BACKFILL: only accepted, fully priced/unbatched contractual deliveries.
-- Existing payment headers/details, paid amounts and receipts are untouched.
-- Multiple allocation lines stay in one payment; rerunning creates zero rows.
WITH eligible AS MATERIALIZED (
  SELECT DISTINCT delivery_id FROM public.payable_delivery_payment_lines(NULL)
), assigned AS MATERIALIZED (
  SELECT public.ensure_pending_delivery_payment(delivery_id) AS payment_id FROM eligible
)
SELECT count(DISTINCT payment_id) AS created_pending_payments,
  count(*) FILTER (WHERE payment_id IS NOT NULL) AS backfilled_deliveries
FROM assigned;

COMMIT;
