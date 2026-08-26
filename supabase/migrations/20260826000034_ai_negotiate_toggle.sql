-- Add AI auto-negotiate toggle to conversations.
-- When true, the ai-negotiate Edge Function will automatically accept or counteroffer
-- Supplier proposals according to the spot price rule.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_auto_negotiate BOOLEAN NOT NULL DEFAULT false;
