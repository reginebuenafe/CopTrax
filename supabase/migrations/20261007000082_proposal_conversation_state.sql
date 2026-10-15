CREATE OR REPLACE FUNCTION public.sync_proposal_conversation_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.conversation_status_enum;
BEGIN
  -- guard_current_proposal acquires the supplier/conversation locks first.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.conversation_id::text));
  SELECT status INTO v_status FROM public.conversations
   WHERE conversation_id = NEW.conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF NEW.supersedes_proposal_id IS NULL THEN
    UPDATE public.conversations SET status = 'Open'
     WHERE conversation_id = NEW.conversation_id AND status = 'Terminated';
  ELSIF v_status <> 'Open' THEN
    RAISE EXCEPTION 'This negotiation is no longer Open. Start a new proposal instead.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sync_proposal_conversation_state ON public.proposal_forms;
CREATE TRIGGER zz_sync_proposal_conversation_state
BEFORE INSERT ON public.proposal_forms
FOR EACH ROW EXECUTE FUNCTION public.sync_proposal_conversation_state();
