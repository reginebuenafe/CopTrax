-- Update ai_negotiate trigger to check global app_config flag
-- instead of the per-conversation ai_auto_negotiate column.
-- This allows the Business Owner to toggle AI for all suppliers at once
-- from the Overview dashboard.

-- Seed the global AI flag if it doesn't exist yet (defaults to off)
INSERT INTO public.app_config (key, value)
VALUES ('ai_auto_negotiate_global', 'false')
ON CONFLICT (key) DO NOTHING;

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
  -- Only process Pending proposals
  IF NEW.proposal_status <> 'Pending' THEN
    RETURN NEW;
  END IF;

  -- Check global AI flag from app_config
  SELECT value INTO v_ai_enabled
    FROM public.app_config
   WHERE key = 'ai_auto_negotiate_global';

  IF v_ai_enabled IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;

  -- Get the business_owner_id for this conversation
  SELECT business_owner_id INTO v_bo_id
    FROM public.conversations
   WHERE conversation_id = NEW.conversation_id;

  -- Skip if the BO submitted this proposal (their own counteroffer)
  IF NEW.submitted_by = v_bo_id THEN
    RETURN NEW;
  END IF;

  -- Read Edge Function URL and anon key from config
  SELECT value INTO v_fn_url   FROM public.app_config WHERE key = 'ai_negotiate_url';
  SELECT value INTO v_anon_key FROM public.app_config WHERE key = 'supabase_anon_key';

  IF v_fn_url IS NULL OR v_anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP call to the Edge Function via pg_net
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
