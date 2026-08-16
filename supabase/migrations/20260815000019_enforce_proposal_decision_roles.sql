-- Suppliers submit proposals; only Business Owners may decide or supersede them.
-- A Supplier response to a BO counteroffer is a new proposal linked through
-- supersedes_proposal_id, so Suppliers do not require UPDATE access.

DROP POLICY IF EXISTS "proposals_update" ON public.proposal_forms;

CREATE POLICY "proposals_update"
ON public.proposal_forms
FOR UPDATE
USING (public.get_my_role() = 'Business Owner')
WITH CHECK (public.get_my_role() = 'Business Owner');
