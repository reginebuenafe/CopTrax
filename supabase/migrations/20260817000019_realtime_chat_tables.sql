-- ============================================================
-- Migration 019: Add chat-relevant tables to Supabase Realtime
-- ============================================================
-- Only notifications was previously in the publication.
-- messages, proposal_forms, contracts, conversations were missing,
-- so postgres_changes subscriptions for those tables never fired.
-- This is the root cause of "other user has to refresh to see messages."
-- ============================================================

DO $$
BEGIN
  -- messages — text messages and proposal/contract cards in the chat
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  -- proposal_forms — realtime negotiation updates
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'proposal_forms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_forms;
  END IF;

  -- contracts — realtime contract status changes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contracts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
  END IF;

  -- conversations — realtime contract_id linkage and status
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
