-- Track who submitted each proposal so counteroffer chains can alternate safely.
ALTER TABLE public.proposal_forms
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(user_id);

-- Historical chains started with a Supplier proposal and alternate submitters.
WITH RECURSIVE proposal_chain AS (
  SELECT
    proposal.proposal_id,
    proposal.supersedes_proposal_id,
    proposal.supplier_id AS submitted_by
  FROM public.proposal_forms AS proposal
  WHERE proposal.supersedes_proposal_id IS NULL

  UNION ALL

  SELECT
    child.proposal_id,
    child.supersedes_proposal_id,
    CASE
      WHEN parent.submitted_by = child.supplier_id THEN conversation.business_owner_id
      ELSE child.supplier_id
    END AS submitted_by
  FROM public.proposal_forms AS child
  JOIN proposal_chain AS parent
    ON parent.proposal_id = child.supersedes_proposal_id
  JOIN public.conversations AS conversation
    ON conversation.conversation_id = child.conversation_id
)
UPDATE public.proposal_forms AS proposal
SET submitted_by = chain.submitted_by
FROM proposal_chain AS chain
WHERE proposal.proposal_id = chain.proposal_id
  AND proposal.submitted_by IS NULL;

-- Preserve access to any orphaned historical rows.
UPDATE public.proposal_forms
SET submitted_by = supplier_id
WHERE submitted_by IS NULL;

ALTER TABLE public.proposal_forms
  ALTER COLUMN submitted_by SET DEFAULT auth.uid(),
  ALTER COLUMN submitted_by SET NOT NULL;

DROP POLICY IF EXISTS "proposals_insert" ON public.proposal_forms;
CREATE POLICY "proposals_insert"
ON public.proposal_forms
FOR INSERT
WITH CHECK (
  submitted_by = auth.uid()
  AND (
    (public.get_my_role() = 'Supplier' AND supplier_id = auth.uid())
    OR public.get_my_role() = 'Business Owner'
  )
);

DROP POLICY IF EXISTS "proposals_update" ON public.proposal_forms;
CREATE POLICY "proposals_update"
ON public.proposal_forms
FOR UPDATE
USING (
  proposal_status = 'Pending'
  AND submitted_by <> auth.uid()
  AND (
    public.get_my_role() = 'Business Owner'
    OR (public.get_my_role() = 'Supplier' AND supplier_id = auth.uid())
  )
)
WITH CHECK (
  submitted_by <> auth.uid()
  AND (
    public.get_my_role() = 'Business Owner'
    OR (public.get_my_role() = 'Supplier' AND supplier_id = auth.uid())
  )
);
