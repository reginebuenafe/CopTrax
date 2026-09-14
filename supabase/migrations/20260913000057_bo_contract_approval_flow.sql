-- ============================================================
-- Migration 057: Business Owner contract approval flow
--
-- SECURITY FIX: previously, sign-contract (the Supplier-facing signing
-- Edge Function) automatically embedded the Business Owner's stored
-- e-signature image into the final PDF and activated the contract in the
-- very same request — the BO never took an explicit action. Separately,
-- BOContractsPage.jsx had an even more direct client-side "Activate
-- Contract" button that inserted BOTH parties' contract_signatures rows
-- from the browser with no hash verification or PDF regeneration at all.
-- Both bypasses are removed by this change.
--
-- NEW REQUIRED FLOW:
--   Pending  →  Pending Owner Review  →  Active
--   (Supplier signs)   (BO opens & reviews,     (BO explicitly approves —
--                        button is enabled)       new approve-contract fn)
--
-- - Supplier signing (sign-contract) now moves status to
--   'Pending Owner Review' and records ONLY the Supplier's signature —
--   never the BO's.
-- - `bo_reviewed_at` is set once the Business Owner opens the specific
--   contract for review (required before the "Approve & Sign Contract"
--   button is enabled in the UI, AND independently re-validated on the
--   backend by the new approve-contract Edge Function).
-- - `bo_signed_at` (already existed, previously unused) now records the
--   BO's explicit approval/signing timestamp, set only by approve-contract
--   after the BO confirms the authorization dialog.
-- - Only approve-contract may transition a contract to 'Active', and only
--   when it is currently 'Pending Owner Review' AND bo_reviewed_at is set
--   AND the caller's JWT identity matches contracts.business_owner_id.
-- ============================================================

-- 1. New intermediate contract status.
ALTER TYPE public.contract_status_enum ADD VALUE IF NOT EXISTS 'Pending Owner Review';

-- 2. Track when the Business Owner first opened this specific contract for
--    review. The "Approve & Sign Contract" action is only ever offered
--    (frontend) and only ever accepted (backend, in approve-contract) once
--    this is non-null.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS bo_reviewed_at TIMESTAMPTZ;

-- 3. Close a latent RLS hole: `contracts_supplier_sign_update` (added in
--    migration 20260804000014_contract_signing_flow.sql) let a Supplier's
--    own authenticated client directly UPDATE any column on their own
--    'Pending' contract row — including `status` itself — with no hash
--    check, no signature recording, and no Business Owner involvement at
--    all. The Supplier-facing frontend has never actually used this (it
--    only ever calls the sign-contract Edge Function, which uses the
--    service role and bypasses RLS), so nothing relies on it. Given the
--    strict requirement that "Supplier signing alone must NEVER activate
--    the contract" and must be enforced server-side (not just by
--    well-behaved frontend code), this policy is removed entirely.
DROP POLICY IF EXISTS contracts_supplier_sign_update ON public.contracts;
