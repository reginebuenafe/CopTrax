-- Business Owner "Record Copra Sale" feature: a persistent, append-only
-- record of copra leaving the Bodega/Resecada pool via direct sale (as
-- opposed to being allocated to a Supplier payment). This is a brand-new
-- table — it intentionally does NOT reuse `inventory_transactions` (which
-- requires a NOT NULL `inventory_batch_id` tying each row to one specific
-- delivery batch) because a copra sale draws down the *aggregate* Bodega
-- Stock figure, not any single batch, and the original delivery/batch
-- records must never be modified or deleted to record it.
--
-- Conceptually: Current Bodega Stock = (SUM of each Resecada batch's own
-- delivery Net Weight, i.e. weighing_records.net_weight_kg — the same basis
-- already used by the Owner Inventory page and the capacity-warning
-- trigger) − (SUM of every recorded copra_sales.net_weight_kg). This table
-- only ever grows; nothing here ever mutates inventory_batches,
-- weighing_records, or deliveries.

CREATE TABLE IF NOT EXISTS public.copra_sales (
  copra_sale_id  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date_sold      DATE NOT NULL,
  net_weight_kg  DECIMAL(12,3) NOT NULL CHECK (net_weight_kg > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID NOT NULL REFERENCES public.users(user_id)
);

ALTER TABLE public.copra_sales ENABLE ROW LEVEL SECURITY;

-- Read access: Business Owner only (same role gate as every other
-- Owner-only report source, e.g. payments/ratings).
DROP POLICY IF EXISTS "copra_sales_select" ON public.copra_sales;
CREATE POLICY "copra_sales_select" ON public.copra_sales
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

-- Deliberately NO client-facing INSERT/UPDATE/DELETE policy. Every sale
-- must go through record_copra_sale() below, which atomically re-validates
-- the available Bodega Stock before inserting — a raw RLS WITH CHECK
-- cannot serialize two near-simultaneous inserts against each other, so it
-- cannot by itself prevent a double "Confirm Sale" click from over-selling
-- stock. Sales are also immutable once recorded (no UPDATE/DELETE path at
-- all), matching the "copra sale remains permanently visible" requirement.

-- Atomic, server-validated sale recording. Mirrors the existing
-- SECURITY DEFINER RPC pattern (record_audit_log, record_contractual_delivery,
-- create_payment_batch): the caller's role is checked explicitly inside the
-- function (since SECURITY DEFINER bypasses RLS), inputs are validated, and
-- an advisory transaction lock serializes concurrent calls so the
-- stock-sufficiency check and the INSERT are atomic — this is what actually
-- prevents a double-submitted "Confirm Sale" (or two concurrent sales) from
-- both passing validation and over-selling the same stock.
CREATE OR REPLACE FUNCTION public.record_copra_sale(
  p_date_sold DATE,
  p_net_weight_kg NUMERIC
)
RETURNS public.copra_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bodega_stock_kg NUMERIC;
  v_total_sold_kg NUMERIC;
  v_available_kg NUMERIC;
  inserted_row public.copra_sales;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can record copra sales'
      USING ERRCODE = '42501';
  END IF;

  IF p_date_sold IS NULL THEN
    RAISE EXCEPTION 'Date sold is required' USING ERRCODE = '22023';
  END IF;

  IF p_net_weight_kg IS NULL OR p_net_weight_kg <= 0 THEN
    RAISE EXCEPTION 'Net weight sold must be greater than zero' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent calls so the check below and the INSERT can never
  -- race against another in-flight record_copra_sale() call.
  PERFORM pg_advisory_xact_lock(hashtext('copra_sales'));

  SELECT COALESCE(SUM(wr.net_weight_kg), 0)
    INTO v_bodega_stock_kg
  FROM public.inventory_batches ib
  JOIN public.weighing_records wr ON wr.delivery_id = ib.delivery_id
  WHERE ib.batch_status = 'Resecada';

  SELECT COALESCE(SUM(net_weight_kg), 0)
    INTO v_total_sold_kg
  FROM public.copra_sales;

  v_available_kg := v_bodega_stock_kg - v_total_sold_kg;

  IF p_net_weight_kg > v_available_kg THEN
    RAISE EXCEPTION 'Sale weight (% kg) exceeds available Bodega Stock (% kg)', p_net_weight_kg, v_available_kg
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.copra_sales (date_sold, net_weight_kg, created_by)
  VALUES (p_date_sold, p_net_weight_kg, auth.uid())
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_copra_sale(DATE, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_copra_sale(DATE, NUMERIC) TO authenticated;
