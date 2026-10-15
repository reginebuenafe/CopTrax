-- Fix: accepting a BO counteroffer could partially complete under a race
-- (e.g. a double-click/rapid repeat Accept, or Accept/Decline firing close
-- together). generate-contract's proposal_id path previously did a plain
-- JS "check existing Pending contract, then write" sequence across several
-- separate REST calls — not atomic, so two concurrent accept attempts for
-- the same proposal could both pass the duplicate-contract check before
-- either had written anything, letting one succeed (contract created,
-- proposal marked Accepted) while the other's response is the ONLY one the
-- Supplier's browser happens to show as an error ("A pending contract
-- already exists"), leaving the UI showing a stale "Pending" offer even
-- though a contract already exists. A concurrent Decline could then also
-- blindly overwrite an already-Accepted proposal back to "Rejected".
--
-- This RPC makes the whole check-then-write sequence one atomic transaction,
-- serialized per-conversation via an advisory lock, so a second concurrent
-- call reliably sees the first call's already-committed state instead of a
-- stale snapshot. It is intended to be called ONLY by the generate-contract
-- Edge Function (via the service-role client), which has already verified
-- the caller's JWT belongs to the proposal's own supplier before invoking it.
CREATE OR REPLACE FUNCTION public.accept_counteroffer_and_create_contract(
  p_proposal_id UUID,
  p_supplier_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal       RECORD;
  v_conv           RECORD;
  v_existing_status contract_status_enum;
  v_contract_number TEXT;
  v_contract_id    UUID;
BEGIN
  SELECT proposal_id, proposal_status, proposed_price_per_kg, proposed_volume_tons,
         supplier_id, conversation_id
    INTO v_proposal
    FROM public.proposal_forms
   WHERE proposal_id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.supplier_id <> p_supplier_id THEN
    RAISE EXCEPTION 'You can only accept proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent accept/decline attempts for the SAME conversation so
  -- the duplicate-contract check and the writes below can never race against
  -- another in-flight call for this conversation.
  PERFORM pg_advisory_xact_lock(hashtext(v_proposal.conversation_id::text));

  -- Re-read the proposal status now that we hold the lock — a concurrent
  -- call (accept or decline) may have already resolved it while we waited.
  SELECT proposal_status INTO v_proposal.proposal_status
    FROM public.proposal_forms WHERE proposal_id = p_proposal_id;

  SELECT conversation_id, contract_id, business_owner_id
    INTO v_conv
    FROM public.conversations
   WHERE conversation_id = v_proposal.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Real duplicate guard: a prior Active/Completed/Breached contract on this
  -- conversation does NOT block a fresh acceptance, only a still-Pending one.
  IF v_conv.contract_id IS NOT NULL THEN
    SELECT status INTO v_existing_status
      FROM public.contracts WHERE contract_id = v_conv.contract_id;

    IF v_existing_status = 'Pending' THEN
      IF v_proposal.proposal_status = 'Accepted' THEN
        -- Idempotent: a concurrent call already accepted this exact proposal
        -- and created this exact contract — hand back the same contract_id.
        RETURN v_conv.contract_id;
      END IF;
      RAISE EXCEPTION 'A pending contract already exists for this conversation.' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_proposal.proposal_status <> 'Pending' THEN
    RAISE EXCEPTION 'Proposal is not Pending (current: %)', v_proposal.proposal_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.proposal_forms SET proposal_status = 'Accepted' WHERE proposal_id = p_proposal_id;

  UPDATE public.proposal_forms SET proposal_status = 'Modified'
   WHERE conversation_id = v_proposal.conversation_id
     AND proposal_status = 'Pending'
     AND proposal_id <> p_proposal_id;

  SELECT public.generate_contract_number() INTO v_contract_number;

  INSERT INTO public.contracts (
    contract_number, supplier_id, business_owner_id,
    negotiated_price_per_kg, contracted_tons, signing_date, status
  ) VALUES (
    v_contract_number, v_proposal.supplier_id, v_conv.business_owner_id,
    v_proposal.proposed_price_per_kg, v_proposal.proposed_volume_tons, CURRENT_DATE, 'Pending'
  ) RETURNING contract_id INTO v_contract_id;

  UPDATE public.conversations SET contract_id = v_contract_id
   WHERE conversation_id = v_proposal.conversation_id;

  RETURN v_contract_id;
END;
$$;

-- Restricted to the service role: this is an internal helper for the
-- generate-contract Edge Function, which has already verified the caller's
-- JWT identity before invoking it — it is not meant to be called directly
-- by Supplier/BO sessions.
REVOKE ALL ON FUNCTION public.accept_counteroffer_and_create_contract(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_counteroffer_and_create_contract(UUID, UUID) TO service_role;

-- Decline must not silently overwrite a proposal that a concurrent Accept
-- already resolved. Conditioning the UPDATE on proposal_status = 'Pending'
-- and returning the affected row lets the frontend detect a lost race
-- (zero rows updated) instead of blindly posting "declined".
