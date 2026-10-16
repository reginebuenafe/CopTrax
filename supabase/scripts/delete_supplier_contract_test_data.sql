-- MANUAL TEST-DATA CLEANUP. This is not a migration.
-- Run the entire file in Supabase SQL Editor as the database owner.
-- Supplier: 6642c109-eb7f-4984-92f1-d4dcba699e04
-- Deletes all of this supplier's contracts and dependent disposable test rows.
-- Keeps the user, chat conversations/messages/proposals, uploaded files, and
-- unrelated deliveries/payments/inventory. Storage objects are not deleted.
-- Shared payments or inventory merges cause the entire operation to abort.
-- If a previous transaction is still aborted, run ROLLBACK before this file.

BEGIN;

-- Freeze the dependency set while collecting IDs and deleting its rows.
LOCK TABLE
  public.contracts, public.contract_signatures, public.conversations,
  public.deliveries, public.delivery_allocations, public.delivery_corrections,
  public.delivery_issue_reports, public.inventory_batches,
  public.inventory_adjustments, public.inventory_transactions,
  public.payments, public.payment_details, public.e_receipts,
  public.quality_results, public.laboratory_inspections,
  public.weighing_records, public.supplier_performance_snapshot
IN SHARE ROW EXCLUSIVE MODE;

DO $cleanup$
DECLARE
  v_supplier_id CONSTANT uuid := '6642c109-eb7f-4984-92f1-d4dcba699e04';
  v_deleted_contracts integer;
BEGIN
  CREATE TEMP TABLE cleanup_contract_ids ON COMMIT DROP AS
    SELECT contract_id FROM public.contracts WHERE supplier_id = v_supplier_id;

  CREATE TEMP TABLE cleanup_delivery_ids ON COMMIT DROP AS
    SELECT d.delivery_id
    FROM public.deliveries d
    WHERE d.contract_id IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids)
       OR EXISTS (
         SELECT 1 FROM public.delivery_allocations a
         WHERE a.delivery_id = d.delivery_id
           AND a.contract_id IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids)
       );

  IF EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids)
      AND (
        (d.supplier_id IS NOT NULL AND d.supplier_id <> v_supplier_id)
        OR (d.contract_id IS NOT NULL AND d.contract_id NOT IN
            (SELECT contract_id FROM pg_temp.cleanup_contract_ids))
      )
  ) OR EXISTS (
    SELECT 1 FROM public.delivery_allocations a
    WHERE a.delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids)
      AND a.contract_id IS NOT NULL
      AND a.contract_id NOT IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids)
  ) THEN
    RAISE EXCEPTION 'Cleanup stopped: a selected delivery belongs to or allocates weight to another supplier/contract.';
  END IF;

  CREATE TEMP TABLE cleanup_payment_ids ON COMMIT DROP AS
    SELECT p.payment_id
    FROM public.payments p
    WHERE EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids)
        AND d.payment_id = p.payment_id
    ) OR EXISTS (
      SELECT 1 FROM public.payment_details pd
      WHERE pd.delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids)
        AND pd.payment_id = p.payment_id
    );

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.payment_id IN (SELECT payment_id FROM pg_temp.cleanup_payment_ids)
      AND p.supplier_id <> v_supplier_id
  ) OR EXISTS (
    SELECT 1 FROM public.payment_details pd
    WHERE pd.payment_id IN (SELECT payment_id FROM pg_temp.cleanup_payment_ids)
      AND pd.delivery_id NOT IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.payment_id IN (SELECT payment_id FROM pg_temp.cleanup_payment_ids)
      AND d.delivery_id NOT IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids)
  ) THEN
    RAISE EXCEPTION 'Cleanup stopped: a selected payment includes deliveries outside this contract cleanup. Nothing was deleted.';
  END IF;

  CREATE TEMP TABLE cleanup_batch_ids ON COMMIT DROP AS
    SELECT inventory_batch_id FROM public.inventory_batches
    WHERE delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids);

  IF EXISTS (
    SELECT 1 FROM public.inventory_batches b
    WHERE b.inventory_batch_id IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids)
      AND b.merged_into_batch_id IS NOT NULL
      AND b.merged_into_batch_id NOT IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_batches b
    WHERE b.inventory_batch_id NOT IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids)
      AND b.merged_into_batch_id IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids)
  ) THEN
    RAISE EXCEPTION 'Cleanup stopped: inventory was merged with batches outside this contract cleanup. Nothing was deleted.';
  END IF;

  -- Remove child rows before their parents; foreign keys stay enabled.
  DELETE FROM public.inventory_adjustments
  WHERE inventory_batch_id IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids);
  DELETE FROM public.inventory_transactions
  WHERE inventory_batch_id IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids);
  UPDATE public.inventory_batches SET merged_into_batch_id = NULL
  WHERE inventory_batch_id IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids);
  DELETE FROM public.inventory_batches
  WHERE inventory_batch_id IN (SELECT inventory_batch_id FROM pg_temp.cleanup_batch_ids);

  DELETE FROM public.payment_details
  WHERE delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids);
  DELETE FROM public.quality_results
  WHERE delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids);

  -- Delivery cascades remove allocations, weighing/inspection rows, and issue
  -- reports/corrections. Payments are removed after deliveries to break their FK.
  DELETE FROM public.deliveries
  WHERE delivery_id IN (SELECT delivery_id FROM pg_temp.cleanup_delivery_ids);
  DELETE FROM public.payments
  WHERE payment_id IN (SELECT payment_id FROM pg_temp.cleanup_payment_ids);
  -- e_receipts cascade from their payments. Physical receipt files are retained.

  DELETE FROM public.supplier_performance_snapshot
  WHERE contract_id IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids);

  -- Prevent the contracts -> conversations cascade from deleting chat history.
  UPDATE public.conversations SET contract_id = NULL
  WHERE contract_id IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids);

  -- Remove only this supplier's signatures; immediately restore their guard.
  ALTER TABLE public.contract_signatures DISABLE TRIGGER contract_signatures_no_update;
  DELETE FROM public.contract_signatures
  WHERE contract_id IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids);
  ALTER TABLE public.contract_signatures ENABLE TRIGGER contract_signatures_no_update;

  DELETE FROM public.contracts
  WHERE contract_id IN (SELECT contract_id FROM pg_temp.cleanup_contract_ids);
  GET DIAGNOSTICS v_deleted_contracts = ROW_COUNT;
  RAISE NOTICE 'Deleted % contracts and their dependent test data for supplier %.', v_deleted_contracts, v_supplier_id;
END;
$cleanup$;

COMMIT;

SELECT count(*) AS remaining_contracts
FROM public.contracts
WHERE supplier_id = '6642c109-eb7f-4984-92f1-d4dcba699e04'::uuid;
