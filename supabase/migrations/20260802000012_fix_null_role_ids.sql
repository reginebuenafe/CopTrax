-- Migration 012: Fix any public.users rows that have role_id = NULL
-- This can happen when:
--   1. A user was created via Supabase Auth dashboard without user_metadata.role
--   2. The auth trigger fired but found no matching role, leaving role_id NULL
--
-- This migration sets role_id based on email matching in cases where the role
-- can be determined from context. For Business Owner accounts seeded before
-- user_metadata was set, update role_id to match the Business Owner role.
--
-- Run this once — it is idempotent (does nothing if role_id is already set).

-- Fix any users row with NULL role_id by inferring role from auth.users metadata.
-- For accounts where metadata has a role set, apply it.
UPDATE public.users u
SET role_id = r.role_id
FROM auth.users au
JOIN public.roles r ON r.role_name = au.raw_user_meta_data->>'role'
WHERE u.user_id = au.id
  AND u.role_id IS NULL
  AND au.raw_user_meta_data->>'role' IS NOT NULL;

-- Ensure the 4 core roles exist (idempotent — safe to re-run).
INSERT INTO public.roles (role_name) VALUES
  ('Business Owner'),
  ('Supplier'),
  ('Weigher'),
  ('Laboratory Staff')
ON CONFLICT (role_name) DO NOTHING;

-- Ensure a default spot price row exists so SupplierOverview and
-- WeigherPage don't blow up when no row has been inserted yet.
INSERT INTO public.spot_price (price_per_ton, updated_at)
SELECT 2000, NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.spot_price);
