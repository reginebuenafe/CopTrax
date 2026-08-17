-- ============================================================
-- Migration 021: Deduplicate conversations + add unique constraint
-- ============================================================
-- ROOT CAUSE: No UNIQUE constraint on (supplier_id, business_owner_id).
-- The frontend did a blind INSERT every time the + button was clicked,
-- creating as many rows as the user clicked.
--
-- STRATEGY (zero data loss):
--   1. For each duplicate (supplier_id, business_owner_id) pair, pick the
--      conversation that has the most activity (messages + proposals).
--      In a tie, pick the oldest (earliest created_at).
--   2. Re-point ALL related rows (messages, proposal_forms, contracts)
--      to the keeper conversation.
--   3. Delete the now-empty duplicate conversation rows.
--   4. Add a UNIQUE constraint so this can never happen again.
-- ============================================================

DO $$
DECLARE
  dup RECORD;
  keeper_id UUID;
  orphan_id UUID;
BEGIN

  -- ── Step 1: For every duplicate (supplier_id, business_owner_id) pair ─────
  FOR dup IN
    SELECT supplier_id, business_owner_id
    FROM public.conversations
    GROUP BY supplier_id, business_owner_id
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the keeper: the conversation with the most messages+proposals.
    -- Tie-break: oldest (lowest created_at, most likely to have the real history).
    SELECT c.conversation_id INTO keeper_id
    FROM public.conversations c
    LEFT JOIN public.messages m ON m.conversation_id = c.conversation_id
    LEFT JOIN public.proposal_forms pf ON pf.conversation_id = c.conversation_id
    WHERE c.supplier_id = dup.supplier_id
      AND c.business_owner_id = dup.business_owner_id
    GROUP BY c.conversation_id, c.created_at
    ORDER BY COUNT(m.message_id) + COUNT(pf.proposal_id) DESC, c.created_at ASC
    LIMIT 1;

    -- ── Step 2: Re-point orphan conversations' children to the keeper ────────
    FOR orphan_id IN
      SELECT conversation_id
      FROM public.conversations
      WHERE supplier_id = dup.supplier_id
        AND business_owner_id = dup.business_owner_id
        AND conversation_id <> keeper_id
    LOOP
      -- Re-point messages
      UPDATE public.messages
        SET conversation_id = keeper_id
        WHERE conversation_id = orphan_id;

      -- Re-point proposal_forms
      UPDATE public.proposal_forms
        SET conversation_id = keeper_id
        WHERE conversation_id = orphan_id;

      -- Merge contract linkage: only set if keeper has none yet
      UPDATE public.conversations
        SET contract_id = (
          SELECT contract_id FROM public.conversations
          WHERE conversation_id = orphan_id AND contract_id IS NOT NULL
          LIMIT 1
        )
        WHERE conversation_id = keeper_id
          AND (SELECT contract_id FROM public.conversations WHERE conversation_id = orphan_id) IS NOT NULL
          AND contract_id IS NULL;

      -- Unlink conversation FK on contracts that point to orphan
      UPDATE public.contracts
        SET -- contracts don't have conversation_id FK; conversations FK the contract
        -- nothing to do here; contracts are linked via conversations.contract_id
        -- already handled above
        contract_id = contract_id  -- no-op, just for clarity
        WHERE FALSE;

      -- Now it is safe to delete the orphan
      DELETE FROM public.conversations WHERE conversation_id = orphan_id;
    END LOOP;
  END LOOP;

END $$;

-- ── Step 3: Add the unique constraint ─────────────────────────────────────────
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_supplier_bo_unique
  UNIQUE (supplier_id, business_owner_id);
