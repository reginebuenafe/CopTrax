-- Bank details are self-service for every authenticated user. Remove the
-- obsolete Supplier change-request workflow and align RLS with the Account
-- Settings page's direct upsert behavior.

DROP POLICY IF EXISTS bank_accounts_owner_select ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_bo_select ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_bo_manage_own ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_bo_update_any ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_self_manage ON public.bank_accounts;

CREATE POLICY bank_accounts_self_manage
  ON public.bank_accounts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY bank_accounts_bo_select
  ON public.bank_accounts
  FOR SELECT
  USING (public.get_my_role() = 'Business Owner');

DROP TABLE IF EXISTS public.bank_change_requests;
