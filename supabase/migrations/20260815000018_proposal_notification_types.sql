-- Use proposal-specific notification labels before a contract is signed.
ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Proposal Accepted';

ALTER TYPE public.notification_type_enum
  ADD VALUE IF NOT EXISTS 'Counteroffer Received';
