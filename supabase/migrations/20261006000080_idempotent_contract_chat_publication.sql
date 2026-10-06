CREATE OR REPLACE FUNCTION public.publish_contract_chat(
  p_contract_id UUID,
  p_conversation_id UUID,
  p_is_ai_generated BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_message_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('contract-chat:' || p_contract_id, 0));
  SELECT * INTO v_contract FROM public.contracts WHERE contract_id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
     WHERE conversation_id = p_conversation_id
       AND supplier_id = v_contract.supplier_id
       AND business_owner_id = v_contract.business_owner_id
  ) THEN
    RAISE EXCEPTION 'Contract participants do not match this conversation.' USING ERRCODE = '42501';
  END IF;
  IF v_contract.contract_document_url IS NULL OR v_contract.contract_hash IS NULL THEN
    RAISE EXCEPTION 'Contract document is not ready.' USING ERRCODE = '22023';
  END IF;

  SELECT message_id INTO v_message_id FROM public.messages
   WHERE conversation_id = p_conversation_id
     AND message_type = 'Contract Form'
     AND message_text LIKE 'CONTRACT_CARD:%'
     AND substring(message_text FROM '"contract_id"\s*:\s*"([^"]+)"') = p_contract_id::text
   ORDER BY sent_at, message_id LIMIT 1;
  IF FOUND THEN RETURN v_message_id; END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, message_type, is_ai_generated, message_text
  ) VALUES (
    p_conversation_id, v_contract.business_owner_id, 'Contract Form', p_is_ai_generated,
    'CONTRACT_CARD:' || jsonb_build_object(
      'contract_id', v_contract.contract_id,
      'contract_number', v_contract.contract_number,
      'price_per_kg', v_contract.negotiated_price_per_kg,
      'contracted_tons', v_contract.contracted_tons,
      'due_date', v_contract.due_date,
      'document_path', v_contract.contract_document_url
    )::text
  ) RETURNING message_id INTO v_message_id;
  INSERT INTO public.messages (
    conversation_id, sender_id, message_type, is_ai_generated, message_text
  ) VALUES (
    p_conversation_id, v_contract.business_owner_id, 'Text', p_is_ai_generated,
    CASE WHEN p_is_ai_generated THEN
      'Your price proposal has been accepted. The contract has been generated — please review and sign when you''re ready.'
    ELSE
      'The contract has been generated. Please review and sign when you''re ready.'
    END
  );
  RETURN v_message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_contract_chat(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_contract_chat(UUID, UUID, BOOLEAN) TO service_role;
