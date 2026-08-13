-- ============================================================
-- Migration 011: Add UNIQUE constraint on user_verify.user_id
-- Required for the upload-registration-files Edge Function to
-- use upsert (INSERT ... ON CONFLICT DO UPDATE) correctly.
-- Without this index, Supabase/PostgREST returns an error when
-- onConflict: "user_id" is specified.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_verify_user_id_unique'
      AND conrelid = 'public.user_verify'::regclass
  ) THEN
    ALTER TABLE public.user_verify
      ADD CONSTRAINT user_verify_user_id_unique UNIQUE (user_id);
  END IF;
END$$;
