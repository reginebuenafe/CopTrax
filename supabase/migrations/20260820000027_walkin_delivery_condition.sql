-- Store the condition used for the walk-in weight adjustment.
ALTER TABLE public.weighing_records
  ADD COLUMN IF NOT EXISTS copra_condition VARCHAR(4) NOT NULL DEFAULT 'Dry';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'weighing_records_copra_condition_check'
      AND conrelid = 'public.weighing_records'::regclass
  ) THEN
    ALTER TABLE public.weighing_records
      ADD CONSTRAINT weighing_records_copra_condition_check
      CHECK (copra_condition IN ('Dry', 'Wet'));
  END IF;
END $$;
