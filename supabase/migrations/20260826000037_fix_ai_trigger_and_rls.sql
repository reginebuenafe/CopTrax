-- Fix 1: Add RLS policy so Business Owner can upsert app_config keys.
--         Without this the toggle saves nothing and resets on reload.
DROP POLICY IF EXISTS app_config_bo_write ON public.app_config;
CREATE POLICY app_config_bo_write ON public.app_config
  FOR ALL
  USING (get_my_role() = 'Business Owner')
  WITH CHECK (get_my_role() = 'Business Owner');

-- Fix 2: Recreate the trigger function with the correct pg_net call.
--   - Use net.http_post (Supabase installs pg_net in the `net` schema)
--   - Pass body and headers as jsonb, not text
CREATE OR REPLACE FUNCTION public.trigger_ai_negotiate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ai_enabled TEXT;
  v_bo_id      UUID;
  v_fn_url     TEXT;
  v_anon_key   TEXT;
BEGIN
  IF NEW.proposal_status <> 'Pending' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_ai_enabled
    FROM public.app_config
   WHERE key = 'ai_auto_negotiate_global';

  IF v_ai_enabled IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;

  SELECT business_owner_id INTO v_bo_id
    FROM public.conversations
   WHERE conversation_id = NEW.conversation_id;

  IF NEW.submitted_by = v_bo_id THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_fn_url   FROM public.app_config WHERE key = 'ai_negotiate_url';
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';

  IF v_fn_url IS NULL OR v_anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Correct call: net schema, jsonb params (not text)
  PERFORM net.http_post(
    url     := v_fn_url,
    body    := json_build_object('proposal_id', NEW.proposal_id)::jsonb,
    headers := json_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    )::jsonb
  );

  RETURN NEW;
END;
$$;
