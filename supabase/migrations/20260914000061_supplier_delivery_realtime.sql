-- Enable the delivery data used by supplier contract/delivery screens in
-- Supabase Realtime. The guarded publication changes keep this migration
-- idempotent for environments where a table was enabled manually.

DO $$
DECLARE
  realtime_table TEXT;
BEGIN
  FOREACH realtime_table IN ARRAY ARRAY[
    'deliveries',
    'delivery_allocations',
    'weighing_records',
    'laboratory_inspections',
    'quality_results'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = realtime_table
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        realtime_table
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I REPLICA IDENTITY FULL',
      realtime_table
    );
  END LOOP;
END $$;
