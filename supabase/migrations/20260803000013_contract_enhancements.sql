-- Migration 013: Contract enhancements for DocuSeal signing workflow and negotiation notifications
-- Adds columns needed for document generation, DocuSeal integration, and
-- proper activation_date → due_date computation per business rules.

-- ── Extend notification_type_enum with negotiation events ────────────────────
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'New Proposal';
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Counteroffer';
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Proposal Rejected';
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Contract Generated';

-- ── New columns on contracts ──────────────────────────────────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS activation_date       DATE,
  ADD COLUMN IF NOT EXISTS docuseal_submission_id TEXT,
  ADD COLUMN IF NOT EXISTS docuseal_supplier_slug TEXT,
  ADD COLUMN IF NOT EXISTS docuseal_bo_slug       TEXT,
  ADD COLUMN IF NOT EXISTS contract_document_url  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_location      TEXT,
  ADD COLUMN IF NOT EXISTS special_notes          TEXT;

-- due_date is now computed from activation_date; nullable until activation
ALTER TABLE public.contracts ALTER COLUMN due_date DROP NOT NULL;

-- ── Trigger: compute due_date when activation_date is first set ───────────────
-- Business rule: due_date = activation_date + 1 month + 1 day  (REQ-4.3)
CREATE OR REPLACE FUNCTION public.on_contract_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.activation_date IS NOT NULL
     AND (OLD.activation_date IS NULL OR NEW.activation_date <> OLD.activation_date)
  THEN
    NEW.due_date := NEW.activation_date + INTERVAL '1 month 1 day';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER contract_activation_trigger
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.on_contract_activated();

-- ── Storage bucket for generated contract documents ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- BO can read/write all contract documents (service role handles inserts)
CREATE POLICY "contracts_bucket_bo_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'contracts'
  AND public.get_my_role() = 'Business Owner'
);

-- Suppliers can read their own contract documents
CREATE POLICY "contracts_bucket_supplier_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'contracts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
