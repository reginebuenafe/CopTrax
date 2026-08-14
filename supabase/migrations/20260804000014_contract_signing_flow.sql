-- Migration 014: In-app contract signing flow
-- New spec (REQ-4.3): Supplier authorizes via checkbox → CopTrax auto-applies
-- their registered e-signature. BO signature is applied automatically afterward
-- (skipped for now, will be enabled when BO signature source is configured).
-- On successful signing, contract becomes Active immediately.

-- ── Track supplier's in-app authorization timestamp ──────────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS supplier_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bo_signed_at           TIMESTAMPTZ;

-- ── Allow the Supplier to update their own contract to Active during signing ─
-- Existing RLS may restrict updates to BO only; add a permissive policy scoped
-- to the sign-contract Edge Function's use (service role bypasses RLS anyway,
-- but this keeps the door open for future client-side calls if needed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'contracts'
      AND policyname = 'contracts_supplier_sign_update'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY contracts_supplier_sign_update
      ON public.contracts
      FOR UPDATE
      USING  (supplier_id = auth.uid() AND status = 'Pending')
      WITH CHECK (supplier_id = auth.uid());
    $POL$;
  END IF;
END $$;
