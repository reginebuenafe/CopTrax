-- Add missing notification_type_enum values introduced during the Aug–Sep bug-fix pass.
--
-- Values added:
--   'Merge Tomorrow'    — daily cron reminder that a Walk-in batch will auto-merge tomorrow
--   'Account Approved'  — BO approves a supplier registration
--   'Account Rejected'  — BO rejects a supplier registration
--   'Proposal Accepted' — BO accepts a supplier's price proposal (replaces incorrect 'Contract Signed')
--   'Payment Failed'    — Xendit payout webhook reports a failed disbursement

ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'Merge Tomorrow';
ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'Account Approved';
ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'Account Rejected';
ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'Proposal Accepted';
ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'Payment Failed';
