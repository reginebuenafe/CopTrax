-- Add number of sacks to walk-in weighing records.
-- Sacks deduction = num_sacks / 2 kg (weight of bags).
ALTER TABLE public.weighing_records
  ADD COLUMN IF NOT EXISTS num_sacks INTEGER;
