-- Migration 015: Bank accounts + bank-change-request approval flow
-- REQ context: Suppliers register with bank info (used for Xendit payouts).
-- Suppliers cannot self-edit bank info — they submit a change request that
-- the Business Owner must approve. Business Owners can freely edit their own.
-- Signatures (esign_file_id on user_verify) are always self-editable.

-- ── Extend notification enum ──────────────────────────────────────────────────
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Bank Change Requested';
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Bank Change Approved';
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Bank Change Rejected';

-- ── bank_accounts ────────────────────────────────────────────────────────────
-- One row per user (Supplier or BO). BO uses this for their own payout account
-- if applicable; Suppliers use it to receive Xendit disbursements.
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  bank_account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  bank_name       VARCHAR(120) NOT NULL,
  account_name    VARCHAR(200) NOT NULL,
  account_number  VARCHAR(60)  NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON public.bank_accounts(user_id);

-- ── bank_change_requests ─────────────────────────────────────────────────────
-- Suppliers cannot directly edit their bank info; they file a request that BO
-- must approve or reject. Only one pending request per supplier at a time.
CREATE TABLE IF NOT EXISTS public.bank_change_requests (
  request_id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id      UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  new_bank_name    VARCHAR(120) NOT NULL,
  new_account_name VARCHAR(200) NOT NULL,
  new_account_number VARCHAR(60) NOT NULL,
  reason           TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by      UUID REFERENCES public.users(user_id),
  reviewed_at      TIMESTAMPTZ,
  review_notes     TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_change_requests_supplier
  ON public.bank_change_requests(supplier_id, status);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.bank_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own bank account
DROP POLICY IF EXISTS bank_accounts_owner_select ON public.bank_accounts;
CREATE POLICY bank_accounts_owner_select
  ON public.bank_accounts FOR SELECT
  USING (user_id = auth.uid());

-- Business Owner can view every bank account (for payouts)
DROP POLICY IF EXISTS bank_accounts_bo_select ON public.bank_accounts;
CREATE POLICY bank_accounts_bo_select
  ON public.bank_accounts FOR SELECT
  USING (public.get_my_role() = 'Business Owner');

-- Business Owner can insert/update their OWN bank account (they can freely edit)
DROP POLICY IF EXISTS bank_accounts_bo_manage_own ON public.bank_accounts;
CREATE POLICY bank_accounts_bo_manage_own
  ON public.bank_accounts FOR ALL
  USING (user_id = auth.uid() AND public.get_my_role() = 'Business Owner')
  WITH CHECK (user_id = auth.uid() AND public.get_my_role() = 'Business Owner');

-- Business Owner can update ANY supplier's bank account (approving a change request)
DROP POLICY IF EXISTS bank_accounts_bo_update_any ON public.bank_accounts;
CREATE POLICY bank_accounts_bo_update_any
  ON public.bank_accounts FOR UPDATE
  USING (public.get_my_role() = 'Business Owner')
  WITH CHECK (public.get_my_role() = 'Business Owner');

-- Suppliers cannot directly write to bank_accounts (no INSERT/UPDATE policy for them)
-- The registration Edge Function uses the service role to seed their initial row.

-- Suppliers can view their own change requests; BO sees all
DROP POLICY IF EXISTS bcr_supplier_select ON public.bank_change_requests;
CREATE POLICY bcr_supplier_select
  ON public.bank_change_requests FOR SELECT
  USING (supplier_id = auth.uid() OR public.get_my_role() = 'Business Owner');

-- Suppliers can create their own change request
DROP POLICY IF EXISTS bcr_supplier_insert ON public.bank_change_requests;
CREATE POLICY bcr_supplier_insert
  ON public.bank_change_requests FOR INSERT
  WITH CHECK (supplier_id = auth.uid());

-- BO can update (approve/reject)
DROP POLICY IF EXISTS bcr_bo_update ON public.bank_change_requests;
CREATE POLICY bcr_bo_update
  ON public.bank_change_requests FOR UPDATE
  USING (public.get_my_role() = 'Business Owner')
  WITH CHECK (public.get_my_role() = 'Business Owner');

-- ── Helper: allow suppliers/BO to reupload their own signature ──────────────
-- (user_verify already has esign_file_id; suppliers may need to update it.)
-- Ensure a self-update RLS policy exists on user_verify for the esign column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_verify'
      AND policyname = 'user_verify_owner_update_esign'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY user_verify_owner_update_esign
      ON public.user_verify FOR UPDATE
      USING  (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    $POL$;
  END IF;
END $$;

-- Allow users to insert their own user_verify row (needed for BOs who have no row yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_verify'
      AND policyname = 'user_verify_owner_insert'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY user_verify_owner_insert
      ON public.user_verify FOR INSERT
      WITH CHECK (user_id = auth.uid());
    $POL$;
  END IF;
END $$;
