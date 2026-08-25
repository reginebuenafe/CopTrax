-- Track when a walk-in delivery has been paid in cash by the Business Owner.
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS walkin_paid_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS walkin_paid_by  UUID REFERENCES public.users(user_id) ON DELETE SET NULL;
