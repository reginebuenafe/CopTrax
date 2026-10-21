-- Revert automatic payment batching to manual "Create Batch" workflow
-- Removes the automatic payment creation triggers that were firing on delivery acceptance
-- This restores the "Ready to Pay" tab as the manual batch-creation entry point

-- Drop the automatic payment creation triggers
DROP TRIGGER IF EXISTS zz_pending_payment_on_delivery_acceptance ON public.deliveries;
DROP TRIGGER IF EXISTS zz_pending_payment_on_quality_acceptance ON public.quality_results;

-- Drop the automatic payment creation function (no longer needed)
DROP FUNCTION IF EXISTS public.create_pending_payment_on_acceptance();

-- Drop the helper function that was only used by the automatic triggers
-- (ensure_pending_delivery_payment was only called by create_pending_payment_on_acceptance)
DROP FUNCTION IF EXISTS public.ensure_pending_delivery_payment(uuid);

-- Note on existing auto-created batches:
-- Any payment batches that were created by the automatic triggers (before this migration)
-- will remain in the database. The Business Owner should manually review these in the
-- "Payment Batches" tab and verify they are legitimate payments to be released.
-- 
-- Going forward (after this migration), new deliveries will require the BO to manually
-- click "Create Batch" in the "Ready to Pay" tab before any payment batches are created.
-- 
-- If needed, batches can be deleted directly via:
--   DELETE FROM public.payment_batches WHERE payment_batch_id = '<batch-id>';
-- This will return those deliveries to the "Ready to Pay" tab for manual review.
