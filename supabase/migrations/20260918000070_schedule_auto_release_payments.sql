-- Schedule the Friday 5:00 PM PHT payment release through a protected
-- pg_net request. The secret remains in app_config, which migration 067
-- prevents browser clients from reading.

INSERT INTO public.app_config (key, value)
VALUES (
  'payment_cron_secret',
  replace(gen_random_uuid()::text, '-', '') ||
  replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_config (key, value)
SELECT
  'auto_release_payments_url',
  regexp_replace(value, '/ai-negotiate/?$', '/auto-release-payments')
FROM public.app_config
WHERE key = 'ai_negotiate_url'
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trigger_auto_release_payments()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_fn_url      TEXT;
  v_anon_key    TEXT;
  v_cron_secret TEXT;
BEGIN
  SELECT value INTO v_fn_url
    FROM public.app_config
   WHERE key = 'auto_release_payments_url';
  SELECT value INTO v_anon_key
    FROM public.app_config
   WHERE key = 'supabase_anon_key';
  SELECT value INTO v_cron_secret
    FROM public.app_config
   WHERE key = 'payment_cron_secret';

  IF v_fn_url IS NULL OR v_anon_key IS NULL OR v_cron_secret IS NULL THEN
    RAISE WARNING 'Auto-release payment configuration is incomplete.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_fn_url,
    body    := '{}'::jsonb,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Cron-Secret', v_cron_secret
    )::jsonb
  );
END;
$$;

SELECT cron.unschedule('auto-release-payments-friday')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'auto-release-payments-friday'
);

SELECT cron.schedule(
  'auto-release-payments-friday',
  '0 9 * * 5',
  $$SELECT public.trigger_auto_release_payments();$$
);
