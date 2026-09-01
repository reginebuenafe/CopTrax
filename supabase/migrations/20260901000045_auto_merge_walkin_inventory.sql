-- Replace the manual "Ready to Merge" workflow with full automation.
--
-- New check_merge_eligibility() now:
--   1. Sends a "Merge Tomorrow" reminder for Walk-in Holding batches
--      whose merge_eligible_date is tomorrow (CURRENT_DATE + 1).
--   2. Automatically merges Walk-in Holding batches whose
--      merge_eligible_date <= CURRENT_DATE directly into Resecada,
--      inserts an inventory_transactions audit row, and notifies the BO.
--
-- The old "Ready to Merge" intermediate status is no longer created —
-- batches move directly from Walk-in Holding → Resecada on day 14.
-- Any existing "Ready to Merge" rows are also auto-merged by this function.

CREATE OR REPLACE FUNCTION public.check_merge_eligibility()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch    RECORD;
  owner_id UUID;
BEGIN
  -- Find the active Business Owner
  SELECT u.user_id INTO owner_id
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE r.role_name = 'Business Owner'
    AND u.account_status = 'Active'
  LIMIT 1;

  -- ── Step 1: Tomorrow reminder ─────────────────────────────────────────────
  -- For every Walk-in Holding batch that becomes eligible tomorrow,
  -- send a "Merge Tomorrow" notification so the BO knows in advance.
  FOR batch IN
    SELECT *
    FROM public.inventory_batches
    WHERE source_type = 'Walkin'
      AND batch_status = 'Walk-in Holding'
      AND merge_eligible_date IS NOT NULL
      AND merge_eligible_date = CURRENT_DATE + INTERVAL '1 day'
  LOOP
    IF owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        owner_id,
        'Merge Tomorrow',
        batch.weight_kg || ' kg walk-in copra batch will be automatically merged into Resecada tomorrow (' ||
          (CURRENT_DATE + INTERVAL '1 day')::DATE || ').',
        'inventory_batches',
        batch.inventory_batch_id
      );
    END IF;
  END LOOP;

  -- ── Step 2: Auto-merge eligible batches ───────────────────────────────────
  -- Merge any Walk-in Holding (or legacy Ready to Merge) batches that
  -- have reached or passed their merge_eligible_date.
  FOR batch IN
    SELECT *
    FROM public.inventory_batches
    WHERE source_type = 'Walkin'
      AND batch_status IN ('Walk-in Holding', 'Ready to Merge')
      AND merge_eligible_date IS NOT NULL
      AND merge_eligible_date <= CURRENT_DATE
  LOOP
    -- Move to Resecada
    UPDATE public.inventory_batches
    SET
      batch_status    = 'Resecada',
      merged_at       = NOW(),
      review_decision = 'Auto-Merged'
    WHERE inventory_batch_id = batch.inventory_batch_id;

    -- Audit log
    INSERT INTO public.inventory_transactions
      (inventory_batch_id, transaction_type, quantity_kg)
    VALUES (
      batch.inventory_batch_id,
      'Merge to Resecada',
      batch.weight_kg
    );

    -- Notify BO: merge completed
    IF owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        owner_id,
        'Merge Completed',
        batch.weight_kg || ' kg walk-in copra batch has been automatically merged into the Resecada pool.',
        'inventory_batches',
        batch.inventory_batch_id
      );
    END IF;
  END LOOP;
END;
$$;
