-- Enable pg_cron extension (must be done before scheduling)
-- Note: If this fails, enable pg_cron in Supabase Dashboard → Database → Extensions first.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the merge eligibility check to run once per day at 00:05 UTC
SELECT cron.schedule(
  'check-merge-eligibility-daily',
  '5 0 * * *',   -- every day at 00:05 UTC
  $$
    SELECT public.check_merge_eligibility();
  $$
);
