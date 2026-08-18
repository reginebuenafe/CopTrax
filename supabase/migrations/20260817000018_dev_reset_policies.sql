-- ============================================================
-- Migration 018: DEV — Delete policies for BO testing reset
-- Allows Business Owner to wipe a conversation's data
-- during development. Safe to leave in — only BO role can
-- delete, and only their own conversations' data.
-- ============================================================

-- BO can delete messages in their own conversations
DROP POLICY IF EXISTS "messages_delete_bo" ON public.messages;
CREATE POLICY "messages_delete_bo" ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.conversation_id = messages.conversation_id
        AND c.business_owner_id = auth.uid()
    )
  );

-- BO can delete proposal_forms in their own conversations
DROP POLICY IF EXISTS "proposal_forms_delete_bo" ON public.proposal_forms;
CREATE POLICY "proposal_forms_delete_bo" ON public.proposal_forms
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.conversation_id = proposal_forms.conversation_id
        AND c.business_owner_id = auth.uid()
    )
  );

-- BO can delete their own contracts (unsigned only — signed ones
-- will fail due to the immutability trigger on contract_signatures,
-- which is intentional; the reset function falls back to Breached)
DROP POLICY IF EXISTS "contracts_delete_bo" ON public.contracts;
CREATE POLICY "contracts_delete_bo" ON public.contracts
  FOR DELETE USING (
    business_owner_id = auth.uid()
    AND public.get_my_role() = 'Business Owner'
  );
