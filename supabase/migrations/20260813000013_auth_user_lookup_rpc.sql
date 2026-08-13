-- ============================================================
-- Migration 013: Look up an auth user by email (re-registration)
-- ============================================================
-- The delete flow soft-deletes an account: it bans the row in auth.users
-- (ban_duration 10y) and sets account_status = 'Deleted' in public.users,
-- preserving historical records. auth.users is therefore the source of
-- truth for "does this email still exist".
--
-- When a deleted supplier re-registers, auth.signUp() rejects the email
-- ("User already registered") and the app re-registers the existing account.
-- The public.users row may be missing or out of sync, so lookups for
-- re-registration must resolve against auth.users directly.

CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(p_email TEXT)
RETURNS TABLE(user_id UUID, auth_email TEXT, banned_until TIMESTAMPTZ, raw_user_meta_data JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id, email, banned_until, raw_user_meta_data
  FROM auth.users
  WHERE email = LOWER(p_email)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(TEXT) TO service_role, anon, authenticated;
