ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.request_owner_assistance(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_supplier_name TEXT;
BEGIN
  SELECT c.business_owner_id, trim(concat_ws(' ', u.first_name, u.last_name))
    INTO v_owner_id, v_supplier_name
    FROM public.conversations c
    JOIN public.users u ON u.user_id = c.supplier_id
   WHERE c.conversation_id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('owner-assistance:' || p_conversation_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_owner_id
       AND notification_type = 'Supplier Assistance Requested'
       AND related_entity_type = 'conversations'
       AND related_entity_id = p_conversation_id
       AND is_read = false
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.notifications (
    user_id, notification_type, message, related_entity_type, related_entity_id, is_read
  ) VALUES (
    v_owner_id, 'Supplier Assistance Requested',
    coalesce(nullif(v_supplier_name, ''), 'A supplier') || ' would like to speak with you.',
    'conversations', p_conversation_id, false
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.request_owner_assistance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_owner_assistance(UUID) TO service_role;
