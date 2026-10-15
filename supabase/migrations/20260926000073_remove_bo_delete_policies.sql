-- ============================================================
-- Migration 073: Remove Business Owner DELETE policies on
-- negotiation/contract tables (security fix for BUG-01).
--
-- Migration 018 (20260817000018_dev_reset_policies.sql) added
-- live DELETE policies allowing the Business Owner to delete
-- messages, proposal_forms, and contracts. These records must
-- be immutable and never deletable by any role, including the
-- Business Owner, via direct client/API calls.
--
-- This migration only drops those three DELETE policies. It
-- does not touch any INSERT/SELECT/UPDATE policy, does not
-- delete any existing data, and does not modify migration 018
-- itself (old applied migrations are never edited).
-- ============================================================

DROP POLICY IF EXISTS "messages_delete_bo" ON public.messages;
DROP POLICY IF EXISTS "proposal_forms_delete_bo" ON public.proposal_forms;
DROP POLICY IF EXISTS "contracts_delete_bo" ON public.contracts;
