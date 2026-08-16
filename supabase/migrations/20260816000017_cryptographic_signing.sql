-- ============================================================
-- Migration 017: Cryptographic Signature Binding
-- ------------------------------------------------------------
-- Replaces the DocuSeal-based contract signing flow with an
-- in-house cryptographically-verifiable signing flow.
--
-- Security properties provided:
--   • Each contract has a canonical SHA-256 hash of its terms.
--   • Every signature row stores the hash the signer agreed to;
--     if the contract's stored terms are later modified, the
--     hash comparison exposes the tampering.
--   • Signer identity is proven by the authenticated Supabase
--     Auth JWT captured at signing time (signer_id).
--   • Signature time, IP address and User-Agent are recorded
--     for a defensible audit trail.
--   • Signature image at time of signing is snapshot-referenced
--     so future edits to the user's registered signature don't
--     retroactively change what appears on a signed contract.
-- ============================================================

-- ── 1. Extend `contracts` with hash + snapshot ─────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_hash          TEXT,
  ADD COLUMN IF NOT EXISTS contract_terms_snapshot JSONB;

COMMENT ON COLUMN public.contracts.contract_hash IS
  'SHA-256 (hex) of the canonical JSON of contract_terms_snapshot. Set when the BO generates the contract. Signers agree to this exact hash.';
COMMENT ON COLUMN public.contracts.contract_terms_snapshot IS
  'Canonical JSON object of the contract terms used to compute contract_hash. Recomputing SHA-256 on this value must yield contract_hash.';

-- ── 2. Extend `contract_signatures` with audit + integrity fields ──
ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS signature_hash       TEXT,
  ADD COLUMN IF NOT EXISTS ip_address           TEXT,
  ADD COLUMN IF NOT EXISTS user_agent           TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_url  TEXT;

COMMENT ON COLUMN public.contract_signatures.signature_hash IS
  'SHA-256 (hex) of the contract terms at the moment this signature was applied. Must equal contracts.contract_hash for the signature to be considered valid.';
COMMENT ON COLUMN public.contract_signatures.ip_address IS
  'IP address of the signer at signing time, for the audit trail.';
COMMENT ON COLUMN public.contract_signatures.user_agent IS
  'User-Agent string of the signer at signing time, for the audit trail.';
COMMENT ON COLUMN public.contract_signatures.signature_image_url IS
  'Snapshot URL of the signer''s e-signature image at signing time. If the signer later changes their registered signature, previously signed contracts still reflect what was actually used.';

-- ── 3. Prevent mutation of an already-signed signature row ─────────
-- The service role (used by the sign-contract Edge Function) is the
-- only path that inserts these rows. This trigger guarantees that
-- once written, an audit row is immutable, so the hash it captured
-- cannot be silently rewritten.
CREATE OR REPLACE FUNCTION public.prevent_signature_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'contract_signatures rows are immutable audit records and cannot be modified or deleted (signature_id = %)', OLD.signature_id;
END;
$$;

DROP TRIGGER IF EXISTS contract_signatures_no_update ON public.contract_signatures;
CREATE TRIGGER contract_signatures_no_update
  BEFORE UPDATE OR DELETE ON public.contract_signatures
  FOR EACH ROW EXECUTE FUNCTION public.prevent_signature_mutation();

-- ── 4. contract_document_path helper — use existing contract_document_url ──
-- No new column needed. The Edge Functions now store the Storage object
-- path (e.g. "<supplier_id>/<contract_id>/preview.pdf") in contract_document_url; the
-- frontend converts it to a signed URL on demand.
COMMENT ON COLUMN public.contracts.contract_document_url IS
  'Path (within the "contracts" storage bucket) of the current contract PDF. Preview PDF when Pending, signed PDF once Active.';

-- ── 5. Ensure contracts bucket allows PDF ────────────────────────────────────
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'contracts' AND (allowed_mime_types IS NULL OR NOT ('application/pdf' = ANY(allowed_mime_types)));
