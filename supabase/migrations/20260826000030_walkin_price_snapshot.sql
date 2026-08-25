-- Add spot price snapshot and computed amount to walk-in deliveries.
-- Stored at delivery-creation time so receipts always reflect what was paid.
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS walkin_spot_price_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS walkin_amount_paid    NUMERIC;
