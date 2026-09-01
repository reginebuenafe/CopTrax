-- Add 'Terminated' to conversation_status_enum.
-- Terminated is used when a negotiation proposal is hard-rejected (ends the negotiation entirely).
-- 'Open' and 'Closed' continue to work exactly as before.

ALTER TYPE public.conversation_status_enum ADD VALUE IF NOT EXISTS 'Terminated';
