-- Persist the final agreed terms independently from contract generation.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS accepted_proposal_id UUID REFERENCES public.proposal_forms(proposal_id),
  ADD COLUMN IF NOT EXISTS agreed_price_per_kg DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS agreed_volume_tons DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS negotiation_finalized_at TIMESTAMPTZ;

-- Link each generated contract to exactly one negotiation.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(conversation_id);

UPDATE public.contracts AS contract
SET conversation_id = conversation.conversation_id
FROM public.conversations AS conversation
WHERE conversation.contract_id = contract.contract_id
  AND contract.conversation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_per_conversation
  ON public.contracts(conversation_id)
  WHERE conversation_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END;
$$;

-- Backfill finalized terms from existing accepted proposals.
WITH latest_accepted AS (
  SELECT DISTINCT ON (proposal.conversation_id)
    proposal.conversation_id,
    proposal.proposal_id,
    proposal.proposed_price_per_kg,
    proposal.proposed_volume_tons,
    proposal.submitted_at
  FROM public.proposal_forms AS proposal
  WHERE proposal.proposal_status = 'Accepted'
  ORDER BY proposal.conversation_id, proposal.submitted_at DESC
)
UPDATE public.conversations AS conversation
SET
  accepted_proposal_id = accepted.proposal_id,
  agreed_price_per_kg = accepted.proposed_price_per_kg,
  agreed_volume_tons = accepted.proposed_volume_tons,
  negotiation_finalized_at = accepted.submitted_at
FROM latest_accepted AS accepted
WHERE conversation.conversation_id = accepted.conversation_id
  AND conversation.negotiation_finalized_at IS NULL;

-- Finalization is atomic and can only be performed by the recipient of the
-- latest pending proposal/counteroffer.
CREATE OR REPLACE FUNCTION public.finalize_negotiation(p_proposal_id UUID)
RETURNS TABLE (
  final_conversation_id UUID,
  final_proposal_id UUID,
  final_price_per_kg DECIMAL(10,2),
  final_volume_tons DECIMAL(10,2),
  final_supplier_id UUID,
  final_business_owner_id UUID,
  finalized_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal_row public.proposal_forms%ROWTYPE;
  conversation_row public.conversations%ROWTYPE;
  actor_id UUID := auth.uid();
  finalized_time TIMESTAMPTZ := NOW();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO proposal_row
  FROM public.proposal_forms
  WHERE proposal_id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR proposal_row.proposal_status <> 'Pending' THEN
    RETURN;
  END IF;

  SELECT * INTO conversation_row
  FROM public.conversations
  WHERE conversation_id = proposal_row.conversation_id
  FOR UPDATE;

  IF NOT FOUND
     OR actor_id NOT IN (conversation_row.supplier_id, conversation_row.business_owner_id)
     OR proposal_row.submitted_by = actor_id
     OR conversation_row.negotiation_finalized_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.proposal_forms
  SET proposal_status = 'Accepted', reviewed_by = actor_id
  WHERE proposal_id = proposal_row.proposal_id;

  UPDATE public.proposal_forms
  SET proposal_status = 'Modified', reviewed_by = actor_id
  WHERE conversation_id = proposal_row.conversation_id
    AND proposal_id <> proposal_row.proposal_id
    AND proposal_status = 'Pending';

  UPDATE public.conversations
  SET
    accepted_proposal_id = proposal_row.proposal_id,
    agreed_price_per_kg = proposal_row.proposed_price_per_kg,
    agreed_volume_tons = proposal_row.proposed_volume_tons,
    negotiation_finalized_at = finalized_time
  WHERE conversation_id = proposal_row.conversation_id;

  RETURN QUERY SELECT
    proposal_row.conversation_id,
    proposal_row.proposal_id,
    proposal_row.proposed_price_per_kg,
    proposal_row.proposed_volume_tons,
    conversation_row.supplier_id,
    conversation_row.business_owner_id,
    finalized_time;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_negotiation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_negotiation(UUID) TO authenticated;

-- No new proposal may be inserted or modified after finalization.
DROP POLICY IF EXISTS "proposals_insert" ON public.proposal_forms;
CREATE POLICY "proposals_insert"
ON public.proposal_forms
FOR INSERT
WITH CHECK (
  submitted_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.conversation_id = proposal_forms.conversation_id
      AND conversation.negotiation_finalized_at IS NULL
      AND (
        (public.get_my_role() = 'Supplier'
          AND proposal_forms.supplier_id = auth.uid()
          AND conversation.supplier_id = auth.uid())
        OR (public.get_my_role() = 'Business Owner'
          AND conversation.business_owner_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "proposals_update" ON public.proposal_forms;
CREATE POLICY "proposals_update"
ON public.proposal_forms
FOR UPDATE
USING (
  proposal_status = 'Pending'
  AND submitted_by <> auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.conversation_id = proposal_forms.conversation_id
      AND conversation.negotiation_finalized_at IS NULL
      AND (
        conversation.business_owner_id = auth.uid()
        OR conversation.supplier_id = auth.uid()
      )
  )
)
WITH CHECK (
  submitted_by <> auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.conversation_id = proposal_forms.conversation_id
      AND conversation.negotiation_finalized_at IS NULL
      AND (
        conversation.business_owner_id = auth.uid()
        OR conversation.supplier_id = auth.uid()
      )
  )
);
