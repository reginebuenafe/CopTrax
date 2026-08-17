-- ============================================================
-- Migration 022: Set REPLICA IDENTITY FULL for Supabase Realtime
-- ============================================================
-- Supabase Realtime postgres_changes with Row Level Security and
-- column filters requires REPLICA IDENTITY FULL so the Realtime
-- server can evaluate RLS policies against the full row payload.
-- Without this, filtered INSERT subscriptions on RLS-protected
-- tables may silently drop events for the recipient user.
-- This migration is idempotent (ALTER TABLE with FULL is safe to re-run).
-- ============================================================

ALTER TABLE public.messages       REPLICA IDENTITY FULL;
ALTER TABLE public.proposal_forms REPLICA IDENTITY FULL;
ALTER TABLE public.contracts      REPLICA IDENTITY FULL;
ALTER TABLE public.conversations  REPLICA IDENTITY FULL;
