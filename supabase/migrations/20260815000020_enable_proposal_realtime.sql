-- Proposal cards and BO decisions must update every chat surface immediately.
-- Supabase only emits postgres_changes for tables in this publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'proposal_forms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_forms;
  END IF;
END;
$$;
