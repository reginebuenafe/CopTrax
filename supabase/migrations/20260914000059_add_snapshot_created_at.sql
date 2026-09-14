-- ============================================================
-- Migration 059: Add created_at to supplier_performance_snapshot
-- so "latest snapshot per supplier" is unambiguous
--
-- Root cause: supplier_performance_snapshot.snapshot_date is a DATE
-- (no time component). When a supplier has multiple contracts
-- completed/breached on the same calendar day, several snapshot rows
-- share the exact same snapshot_date. Every place that picks "the
-- supplier's current/latest rating" (SupplierRatingsPage,
-- MyRatingPage, OwnerOverview Top Suppliers, BOChatLayout,
-- ai-negotiate's rating-based pricing, and this table's own running-
-- average recompute in migration 054/058) orders only by
-- snapshot_date DESC, so ties are broken arbitrarily by whatever order
-- Postgres happens to return them in — different pages could show a
-- different "latest" overall rating for the exact same supplier at
-- the exact same time (observed: 2.00 vs 2.67 vs 2.25 for 3 same-day
-- snapshots that should resolve to a single correct running average).
--
-- Fix:
--   1. Add supplier_performance_snapshot.created_at (TIMESTAMPTZ,
--      DEFAULT now()) so every future row gets a real, unambiguous
--      insertion timestamp.
--   2. Backfill created_at for existing rows using each row's
--      physical storage order (ctid) as the best available proxy for
--      original insertion order, spaced 1 second apart following
--      snapshot_date order, then ctid order within the same date.
--   3. Recompute overall_supplier_rating as the running (cumulative)
--      average ordered by the new created_at column (instead of the
--      ambiguous snapshot_date), so every row's overall rating now
--      reflects one single, consistent chronological replay.
-- ============================================================

-- 1. Add the column.
ALTER TABLE public.supplier_performance_snapshot
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Backfill existing rows with a deterministic, monotonic order:
--    snapshot_date ASC first (real calendar order), ctid ASC as the
--    tiebreak for same-day rows (best available proxy for insertion
--    order since no better information exists for historical rows).
WITH ordered AS (
  SELECT snapshot_id,
         ROW_NUMBER() OVER (ORDER BY snapshot_date ASC, ctid ASC) AS rn
  FROM public.supplier_performance_snapshot
)
UPDATE public.supplier_performance_snapshot sps
SET created_at = TIMESTAMPTZ '2020-01-01 00:00:00+00' + (ordered.rn * INTERVAL '1 second')
FROM ordered
WHERE sps.snapshot_id = ordered.snapshot_id;

-- 3. Recompute overall_supplier_rating as the running (cumulative)
--    average per supplier, now ordered by the unambiguous created_at
--    column instead of snapshot_date.
WITH ranked AS (
  SELECT
    snapshot_id,
    ROUND(
      AVG(supplier_rating) OVER (
        PARTITION BY supplier_id
        ORDER BY created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ), 2
    ) AS running_avg
  FROM public.supplier_performance_snapshot
)
UPDATE public.supplier_performance_snapshot sps
SET overall_supplier_rating = ranked.running_avg
FROM ranked
WHERE sps.snapshot_id = ranked.snapshot_id;
