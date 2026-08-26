-- Enable pg_net extension for making HTTP calls from DB triggers.
-- If this fails: enable it in Supabase Dashboard → Database → Extensions → pg_net.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store the Edge Function URL so the trigger can call it without hardcoding.
-- After applying this migration, run:
--   INSERT INTO public.app_config (key, value) VALUES
--     ('ai_negotiate_url', 'https://<your-project-ref>.supabase.co/functions/v1/ai-negotiate'),
--     ('supabase_anon_key', '<your-anon-key>');
CREATE TABLE IF NOT EXISTS public.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Allow Edge Functions (service role) and DB functions to read config.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_service_read ON public.app_config;
CREATE POLICY app_config_service_read ON public.app_config FOR SELECT USING (true);

-- Trigger function: fires on every new proposal_forms row.
-- If the conversation has ai_auto_negotiate = true and the proposal was
-- submitted by the Supplier (not the BO), call ai-negotiate Edge Function.
CREATE OR REPLACE FUNCTION public.trigger_ai_negotiate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ai_enabled BOOLEAN;
  v_bo_id      UUID;
  v_fn_url     TEXT;
  v_anon_key   TEXT;
BEGIN
  -- Only process Pending proposals from the Supplier side
  IF NEW.proposal_status <> 'Pending' THEN
    RETURN NEW;
  END IF;

  -- Fetch conversation settings
  SELECT ai_auto_negotiate, business_owner_id
    INTO v_ai_enabled, v_bo_id
    FROM public.conversations
   WHERE conversation_id = NEW.conversation_id;

  -- Skip if AI is off or if the BO themselves submitted this proposal
  IF NOT v_ai_enabled OR NEW.submitted_by = v_bo_id THEN
    RETURN NEW;
  END IF;

  -- Read function URL and anon key from config table
  SELECT value INTO v_fn_url  FROM public.app_config WHERE key = 'ai_negotiate_url';
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';

  IF v_fn_url IS NULL OR v_anon_key IS NULL THEN
    -- Config not yet set — skip silently; frontend will still trigger when BO is online
    RETURN NEW;
  END IF;

  -- Call the Edge Function asynchronously via pg_net (fire-and-forget)
  PERFORM extensions.http_post(
    url     := v_fn_url,
    body    := json_build_object('proposal_id', NEW.proposal_id)::text,
    headers := json_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    )::text
  );

  RETURN NEW;
END;
$$;

-- Attach the trigger to proposal_forms INSERT
DROP TRIGGER IF EXISTS ai_negotiate_on_proposal ON public.proposal_forms;
CREATE TRIGGER ai_negotiate_on_proposal
  AFTER INSERT ON public.proposal_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_negotiate();
