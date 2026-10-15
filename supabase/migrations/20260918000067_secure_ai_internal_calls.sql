-- Replace the public anon-key trust used by the AI negotiation trigger with
-- a database-generated secret. The trigger and service-role Edge Function
-- can read this value; browser clients cannot.

INSERT INTO public.app_config (key, value)
VALUES (
  'ai_internal_secret',
  replace(gen_random_uuid()::text, '-', '') ||
  replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS app_config_service_read ON public.app_config;
DROP POLICY IF EXISTS app_config_bo_read ON public.app_config;
CREATE POLICY app_config_bo_read ON public.app_config
  FOR SELECT
  USING (
    public.get_my_role() = 'Business Owner'
    AND key IN ('ai_auto_negotiate_global', 'ai_faq_global')
  );

DROP POLICY IF EXISTS app_config_bo_write ON public.app_config;
DROP POLICY IF EXISTS app_config_bo_insert ON public.app_config;
DROP POLICY IF EXISTS app_config_bo_update ON public.app_config;
DROP POLICY IF EXISTS app_config_bo_delete ON public.app_config;
CREATE POLICY app_config_bo_insert ON public.app_config
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'Business Owner'
    AND key IN ('ai_auto_negotiate_global', 'ai_faq_global')
  );
CREATE POLICY app_config_bo_update ON public.app_config
  FOR UPDATE
  USING (
    public.get_my_role() = 'Business Owner'
    AND key IN ('ai_auto_negotiate_global', 'ai_faq_global')
  )
  WITH CHECK (
    public.get_my_role() = 'Business Owner'
    AND key IN ('ai_auto_negotiate_global', 'ai_faq_global')
  );
CREATE POLICY app_config_bo_delete ON public.app_config
  FOR DELETE
  USING (
    public.get_my_role() = 'Business Owner'
    AND key IN ('ai_auto_negotiate_global', 'ai_faq_global')
  );

CREATE OR REPLACE FUNCTION public.trigger_ai_negotiate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_ai_enabled     TEXT;
  v_bo_id          UUID;
  v_fn_url         TEXT;
  v_anon_key       TEXT;
  v_internal_secret TEXT;
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

  SELECT value INTO v_fn_url
    FROM public.app_config
   WHERE key = 'ai_negotiate_url';
  SELECT value INTO v_anon_key
    FROM public.app_config
   WHERE key = 'supabase_anon_key';
  SELECT value INTO v_internal_secret
    FROM public.app_config
   WHERE key = 'ai_internal_secret';

  IF v_fn_url IS NULL OR v_anon_key IS NULL OR v_internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_fn_url,
    body    := json_build_object('proposal_id', NEW.proposal_id)::jsonb,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-CopTrax-Internal-Secret', v_internal_secret
    )::jsonb
  );

  RETURN NEW;
END;
$$;
