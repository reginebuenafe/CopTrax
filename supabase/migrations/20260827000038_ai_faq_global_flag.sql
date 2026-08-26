-- Seed the global AI FAQ flag in app_config (defaults to off).
INSERT INTO public.app_config (key, value)
VALUES ('ai_faq_global', 'false')
ON CONFLICT (key) DO NOTHING;
