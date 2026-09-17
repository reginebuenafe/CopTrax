-- Generate payment receipts atomically. COUNT(*)-based numbering can collide
-- when multiple successful payout webhooks arrive at the same time.

DELETE FROM public.e_receipts newer
USING public.e_receipts older
WHERE newer.payment_id = older.payment_id
  AND (
    newer.generated_at > older.generated_at
    OR (
      newer.generated_at = older.generated_at
      AND newer.receipt_id::text > older.receipt_id::text
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS e_receipts_payment_id_key
  ON public.e_receipts (payment_id);

CREATE SEQUENCE IF NOT EXISTS public.e_receipt_number_seq;

DO $$
DECLARE
  v_max_suffix BIGINT;
BEGIN
  SELECT MAX((regexp_match(receipt_number, '([0-9]+)$'))[1]::BIGINT)
    INTO v_max_suffix
    FROM public.e_receipts
   WHERE receipt_number ~ '[0-9]+$';

  IF v_max_suffix IS NULL THEN
    PERFORM setval('public.e_receipt_number_seq', 1, false);
  ELSE
    PERFORM setval('public.e_receipt_number_seq', v_max_suffix, true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_payment_receipt(p_payment_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_number TEXT;
BEGIN
  SELECT receipt_number
    INTO v_receipt_number
    FROM public.e_receipts
   WHERE payment_id = p_payment_id;

  IF v_receipt_number IS NOT NULL THEN
    RETURN v_receipt_number;
  END IF;

  v_receipt_number :=
    'RCP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.e_receipt_number_seq')::TEXT, 4, '0');

  INSERT INTO public.e_receipts (payment_id, receipt_number)
  VALUES (p_payment_id, v_receipt_number)
  ON CONFLICT (payment_id) DO NOTHING;

  SELECT receipt_number
    INTO v_receipt_number
    FROM public.e_receipts
   WHERE payment_id = p_payment_id;

  RETURN v_receipt_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_receipt(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment_receipt(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.create_payment_receipt(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_receipt(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_successful_payment(
  p_payment_id UUID,
  p_reference_number TEXT
)
RETURNS TABLE (receipt_number TEXT, finalized BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.payments.payment_status%TYPE;
  v_receipt_number TEXT;
BEGIN
  SELECT payment_status
    INTO v_status
    FROM public.payments
   WHERE payment_id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_status = 'Released' THEN
    SELECT er.receipt_number
      INTO v_receipt_number
      FROM public.e_receipts er
     WHERE er.payment_id = p_payment_id;
    RETURN QUERY SELECT v_receipt_number, false;
    RETURN;
  END IF;

  IF v_status <> 'Processing' THEN
    RETURN QUERY SELECT NULL::TEXT, false;
    RETURN;
  END IF;

  v_receipt_number := public.create_payment_receipt(p_payment_id);

  UPDATE public.payments
     SET payment_status = 'Released',
         reference_number = p_reference_number,
         payment_date = CURRENT_DATE
   WHERE payment_id = p_payment_id;

  RETURN QUERY SELECT v_receipt_number, true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_successful_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_successful_payment(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_successful_payment(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_successful_payment(UUID, TEXT) TO service_role;
