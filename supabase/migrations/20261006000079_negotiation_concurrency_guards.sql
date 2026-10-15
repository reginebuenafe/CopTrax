ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES public.proposal_forms(proposal_id);
CREATE UNIQUE INDEX IF NOT EXISTS contracts_source_proposal_unique
  ON public.contracts(source_proposal_id) WHERE source_proposal_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_active_contract_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'Active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'Active' AND OLD.supplier_id = NEW.supplier_id THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier-contracts:' || NEW.supplier_id, 0));
  IF (SELECT count(*) FROM public.contracts
      WHERE supplier_id = NEW.supplier_id AND status = 'Active'
        AND contract_id <> NEW.contract_id) >= 3 THEN
    RAISE EXCEPTION 'Supplier may have a maximum of 3 Active contracts.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_contract_limit ON public.contracts;
CREATE TRIGGER enforce_active_contract_limit
BEFORE INSERT OR UPDATE OF status, supplier_id ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.enforce_active_contract_limit();

CREATE OR REPLACE FUNCTION public.guard_current_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_latest UUID;
  v_parent_status public.proposal_status_enum;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.supersedes_proposal_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('supplier-contracts:' || NEW.supplier_id, 0));
      IF (SELECT count(*) FROM public.contracts
          WHERE supplier_id = NEW.supplier_id AND status = 'Active') >= 3 THEN
        RAISE EXCEPTION 'Supplier may have a maximum of 3 Active contracts.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(NEW.conversation_id::text));
    IF NEW.supersedes_proposal_id IS NOT NULL THEN
      SELECT proposal_id INTO v_latest FROM public.proposal_forms
       WHERE conversation_id = NEW.conversation_id
       ORDER BY submitted_at DESC, proposal_id DESC LIMIT 1;
      SELECT proposal_status INTO v_parent_status FROM public.proposal_forms
       WHERE proposal_id = NEW.supersedes_proposal_id AND conversation_id = NEW.conversation_id;
      IF v_latest IS DISTINCT FROM NEW.supersedes_proposal_id
         OR v_parent_status IS NULL OR v_parent_status NOT IN ('Pending', 'Modified') THEN
        RAISE EXCEPTION 'This offer is no longer the current proposal. Refresh the conversation.'
          USING ERRCODE = '22023';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.proposal_status IS NOT DISTINCT FROM OLD.proposal_status
     OR NEW.proposal_status NOT IN ('Accepted', 'Rejected') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(OLD.conversation_id::text));
  SELECT proposal_id INTO v_latest FROM public.proposal_forms
   WHERE conversation_id = OLD.conversation_id
   ORDER BY submitted_at DESC, proposal_id DESC LIMIT 1;
  IF OLD.proposal_status <> 'Pending' OR v_latest IS DISTINCT FROM OLD.proposal_id THEN
    RAISE EXCEPTION 'This offer is no longer the current Pending proposal. Refresh the conversation.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_current_proposal ON public.proposal_forms;
CREATE TRIGGER guard_current_proposal
BEFORE INSERT OR UPDATE OF proposal_status ON public.proposal_forms
FOR EACH ROW EXECUTE FUNCTION public.guard_current_proposal();

CREATE OR REPLACE FUNCTION public.accept_negotiation_and_create_contract(
  p_proposal_id UUID, p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proposal public.proposal_forms%ROWTYPE;
  v_conv public.conversations%ROWTYPE;
  v_latest UUID;
  v_submitter UUID;
  v_contract_id UUID;
  v_status public.contract_status_enum;
  v_number TEXT;
BEGIN
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_proposal.conversation_id::text));
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  SELECT * INTO v_conv FROM public.conversations WHERE conversation_id = v_proposal.conversation_id;
  IF p_actor_id IS NULL OR p_actor_id NOT IN (v_conv.supplier_id, v_conv.business_owner_id) THEN
    RAISE EXCEPTION 'You can only accept proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;
  SELECT proposal_id INTO v_latest FROM public.proposal_forms
   WHERE conversation_id = v_conv.conversation_id
   ORDER BY submitted_at DESC, proposal_id DESC LIMIT 1;
  IF v_latest IS DISTINCT FROM p_proposal_id THEN
    RAISE EXCEPTION 'This offer is no longer the current proposal. Refresh the conversation.' USING ERRCODE = '22023';
  END IF;
  v_submitter := v_proposal.submitted_by;
  IF v_submitter IS NULL THEN
    SELECT CASE WHEN count(*) % 2 = 0 THEN v_conv.supplier_id ELSE v_conv.business_owner_id END
      INTO v_submitter FROM public.proposal_forms
     WHERE conversation_id = v_conv.conversation_id
       AND (submitted_at, proposal_id) < (v_proposal.submitted_at, v_proposal.proposal_id);
  END IF;
  IF v_submitter = p_actor_id THEN
    RAISE EXCEPTION 'Only the recipient can accept this offer.' USING ERRCODE = '42501';
  END IF;
  SELECT contract_id INTO v_contract_id FROM public.contracts WHERE source_proposal_id = p_proposal_id;
  IF FOUND THEN RETURN v_contract_id; END IF;

  IF v_proposal.proposal_status NOT IN ('Pending', 'Accepted') THEN
    RAISE EXCEPTION 'Proposal is not Pending (current: %)', v_proposal.proposal_status USING ERRCODE = '22023';
  END IF;
  IF v_proposal.proposal_status = 'Accepted' AND v_conv.contract_id IS NOT NULL THEN
    -- Legacy contracts have no source_proposal_id; reuse, never duplicate them.
    SELECT contract_id INTO v_contract_id FROM public.contracts
     WHERE contract_id = v_conv.contract_id AND source_proposal_id IS NULL
       AND negotiated_price_per_kg = v_proposal.proposed_price_per_kg
       AND contracted_tons = v_proposal.proposed_volume_tons;
    IF FOUND THEN RETURN v_contract_id; END IF;
  END IF;
  IF v_conv.status = 'Terminated' THEN
    RAISE EXCEPTION 'Conversation is terminated.' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_status FROM public.contracts WHERE contract_id = v_conv.contract_id;
  IF v_status IN ('Pending', 'Pending Owner Review') THEN
    RAISE EXCEPTION 'A pending contract already exists for this conversation.' USING ERRCODE = '23505';
  END IF;
  UPDATE public.proposal_forms
     SET proposal_status = 'Accepted',
         reviewed_by = CASE WHEN p_actor_id = v_conv.business_owner_id THEN p_actor_id ELSE reviewed_by END
   WHERE proposal_id = p_proposal_id AND proposal_status = 'Pending';
  UPDATE public.proposal_forms SET proposal_status = 'Modified'
   WHERE conversation_id = v_conv.conversation_id AND proposal_status = 'Pending'
     AND proposal_id <> p_proposal_id;
  -- The existing number generator is MAX-based and also needs serialization.
  PERFORM pg_advisory_xact_lock(hashtextextended('negotiation-contract-number', 0));
  SELECT public.generate_contract_number() INTO v_number;
  INSERT INTO public.contracts (
    contract_number, supplier_id, business_owner_id, negotiated_price_per_kg,
    contracted_tons, signing_date, status, source_proposal_id
  ) VALUES (
    v_number, v_conv.supplier_id, v_conv.business_owner_id, v_proposal.proposed_price_per_kg,
    v_proposal.proposed_volume_tons, CURRENT_DATE, 'Pending', p_proposal_id
  ) RETURNING contract_id INTO v_contract_id;
  UPDATE public.conversations SET contract_id = v_contract_id WHERE conversation_id = v_conv.conversation_id;
  RETURN v_contract_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_negotiation_and_create_contract(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_negotiation_and_create_contract(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_counteroffer_and_create_contract(p_proposal_id UUID, p_supplier_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.proposal_forms
                 WHERE proposal_id = p_proposal_id AND supplier_id = p_supplier_id) THEN
    RAISE EXCEPTION 'You can only accept proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;
  RETURN public.accept_negotiation_and_create_contract(p_proposal_id, p_supplier_id);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_counteroffer_and_create_contract(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_counteroffer_and_create_contract(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.decline_current_proposal(p_proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proposal public.proposal_forms%ROWTYPE;
  v_conv public.conversations%ROWTYPE;
  v_submitter UUID;
BEGIN
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_proposal.conversation_id::text));
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  SELECT * INTO v_conv FROM public.conversations WHERE conversation_id = v_proposal.conversation_id;
  IF auth.uid() IS NULL OR auth.uid() NOT IN (v_conv.supplier_id, v_conv.business_owner_id) THEN
    RAISE EXCEPTION 'You can only decline proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;
  v_submitter := v_proposal.submitted_by;
  IF v_submitter IS NULL THEN
    SELECT CASE WHEN count(*) % 2 = 0 THEN v_conv.supplier_id ELSE v_conv.business_owner_id END
      INTO v_submitter FROM public.proposal_forms
     WHERE conversation_id = v_conv.conversation_id
       AND (submitted_at, proposal_id) < (v_proposal.submitted_at, v_proposal.proposal_id);
  END IF;
  IF v_submitter = auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can decline this offer.' USING ERRCODE = '42501';
  END IF;
  IF v_proposal.proposal_status <> 'Pending' OR v_conv.status = 'Terminated' THEN
    RAISE EXCEPTION 'This offer is no longer Pending. Refresh the conversation.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.proposal_forms
     SET proposal_status = 'Rejected',
         reviewed_by = CASE WHEN auth.uid() = v_conv.business_owner_id THEN auth.uid() ELSE reviewed_by END
   WHERE proposal_id = p_proposal_id;
  UPDATE public.conversations SET status = 'Terminated' WHERE conversation_id = v_conv.conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decline_current_proposal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_current_proposal(UUID) TO authenticated;
