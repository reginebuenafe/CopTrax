-- 20260824000028_payment_processing_status.sql
-- Adds 'Processing' to payment_status_enum (Pending → Processing → Released/Failed).
-- Adds xendit_payout_id column to payments for payout reference and duplicate-prevention.

ALTER TYPE public.payment_status_enum ADD VALUE IF NOT EXISTS 'Processing';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS xendit_payout_id TEXT;
