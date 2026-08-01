-- ============================================================
-- Migration 011: Add UNIQUE constraint on user_verify.user_id
-- Required for the upload-registration-files Edge Function to
-- use upsert (INSERT ... ON CONFLICT DO UPDATE) correctly.
-- Without this index, Supabase/PostgREST returns an error when
-- onConflict: "user_id" is specified.
-- ============================================================

ALTER TABLE public.user_verify
  ADD CONSTRAINT user_verify_user_id_unique UNIQUE (user_id);
