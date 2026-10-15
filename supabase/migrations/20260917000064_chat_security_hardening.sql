-- ============================================================
-- Migration 064: Chat/negotiation security hardening
--
-- Fixes two RLS gaps found in a security audit of the negotiation/chat
-- system. Neither change alters negotiation business logic, pricing rules,
-- or any existing legitimate call path — they only close cross-user
-- access-control gaps.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROPOSAL_FORMS: the existing "proposals_insert" policy (migration 024)
--    checks that the inserting Supplier owns `supplier_id`, but never checks
--    that `conversation_id` actually belongs to that Supplier (or, for the
--    Business Owner branch, that it belongs to that Business Owner). A
--    Supplier (or BO) could therefore insert a proposal/counteroffer into
--    ANY conversation UUID they can guess/obtain, as long as `supplier_id`
--    on the row was their own — even though it targets someone else's
--    negotiation. This adds the missing conversation-ownership check.
--    Same allowed combinations (initial-proposal cap, counteroffer rule)
--    are preserved exactly.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "proposals_insert" ON public.proposal_forms;

CREATE POLICY "proposals_insert" ON public.proposal_forms
  FOR INSERT WITH CHECK (
    -- Supplier: initial proposal allowed only when they have < 3 Active
    -- contracts, and only into a conversation that is actually theirs.
    (
      public.get_my_role() = 'Supplier'
      AND supplier_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.conversation_id = proposal_forms.conversation_id
          AND c.supplier_id = auth.uid()
      )
      AND (
        supersedes_proposal_id IS NOT NULL
        OR (
          SELECT COUNT(*)
          FROM public.contracts c
          WHERE c.supplier_id = auth.uid()
            AND c.status = 'Active'
        ) < 3
      )
    )
    OR
    -- Business Owner: counteroffers only, and only into a conversation
    -- that is actually theirs.
    (
      public.get_my_role() = 'Business Owner'
      AND supersedes_proposal_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.conversation_id = proposal_forms.conversation_id
          AND c.business_owner_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 2. NOTIFICATIONS: the existing "notifications_insert" policy (migration
--    008) allowed ANY authenticated user to insert a notification targeting
--    ANY other user with arbitrary content — a Supplier could spoof e.g. a
--    fake "Payment Released" notification pointed at another Supplier, the
--    Business Owner, or any staff account. Replace with a relationship-
--    scoped check that still covers every existing legitimate call site
--    (BO<->Supplier chat/negotiation, BO approving/rejecting a Supplier's
--    registration, Laboratory Staff notifying a Supplier about their
--    delivery), while blocking notifications to unrelated users.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Notifying yourself is always fine.
      user_id = auth.uid()
      -- Business Owner already has systemwide visibility/authority over
      -- every supplier and staff account (approvals, contracts, deliveries,
      -- payments) — allow BO to notify any user, matching that existing
      -- authority instead of narrowing it here.
      OR public.get_my_role() = 'Business Owner'
      -- Chat/negotiation participants may notify only the OTHER party in
      -- one of their own shared conversations.
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE (c.business_owner_id = auth.uid() AND c.supplier_id = notifications.user_id)
           OR (c.supplier_id = auth.uid() AND c.business_owner_id = notifications.user_id)
      )
      -- Laboratory Staff may notify a Supplier who actually has a contract
      -- with the business (delivery acceptance/rejection notifications).
      OR (
        public.get_my_role() = 'Laboratory Staff'
        AND EXISTS (SELECT 1 FROM public.contracts ct WHERE ct.supplier_id = notifications.user_id)
      )
    )
  );

-- ------------------------------------------------------------
-- 3. MESSAGES: defense-in-depth length cap. The frontend already limits
--    the chat input to 2000 characters, but that only stops the normal UI
--    — a malicious client could still call the Supabase REST/JS API
--    directly with an arbitrarily large `message_text` (spam/DoS payload
--    stored in the DB and re-rendered to the other party on every load).
--    20,000 chars comfortably covers every legitimate system-generated
--    payload (e.g. the AI FAQ's full MC_TABLE:<json> moisture-content
--    table and CONTRACT_CARD:<json> messages) while still rejecting
--    grossly oversized abuse payloads. Applies to every insert path
--    (RLS-checked client inserts AND service-role Edge Function inserts),
--    since a CHECK constraint is enforced regardless of role.
-- ------------------------------------------------------------
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_text_length_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_text_length_check CHECK (char_length(message_text) <= 20000);

-- ------------------------------------------------------------
-- 4. RATE LIMITING: a malicious/compromised client could hammer the
--    `messages` or `proposal_forms` insert endpoints far faster than any
--    real human/negotiation flow ever would (spam, DoS-by-storage, or
--    brute-forcing the proposal/counteroffer loop). Add a small generic
--    rate-limit log + trigger that rejects inserts once a per-user rate
--    is exceeded. Only applies to real end-user requests — `auth.uid()`
--    is NULL for service-role/internal callers (Edge Functions using the
--    service key, and the pg_net AI-negotiate trigger), so the existing
--    AI auto-response/auto-counteroffer paths are never throttled.
--    Limits are generous enough to never affect legitimate rapid
--    back-and-forth negotiation or chat use:
--      - messages:       max 30 inserts / rolling 10 seconds / user
--      - proposal_forms: max 10 inserts / rolling 30 seconds / user
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_user_action_time
  ON public.rate_limit_log (user_id, action, created_at DESC);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
-- Only accessed internally by trigger functions (SECURITY DEFINER); no
-- direct client access is needed or granted.
DROP POLICY IF EXISTS "rate_limit_log_no_client_access" ON public.rate_limit_log;
CREATE POLICY "rate_limit_log_no_client_access" ON public.rate_limit_log
  FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action TEXT,
  p_limit  INT,
  p_window_seconds INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  -- Trusted internal/service-role callers have no auth.uid(); never
  -- throttle them (this is the existing AI auto-response/counteroffer path).
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_log
  WHERE user_id = v_uid
    AND action = p_action
    AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded for %, please slow down.', p_action
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_log (user_id, action) VALUES (v_uid, p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_messages_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_rate_limit('messages_insert', 30, 10);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_rate_limit ON public.messages;
CREATE TRIGGER trg_messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_rate_limit();

CREATE OR REPLACE FUNCTION public.enforce_proposals_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_rate_limit('proposal_forms_insert', 10, 30);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_rate_limit ON public.proposal_forms;
CREATE TRIGGER trg_proposals_rate_limit
  BEFORE INSERT ON public.proposal_forms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_proposals_rate_limit();

