-- ============================================================
-- Migration 063: Enforce delivery-allocation cap + reconciliation tools
--
-- Reported issue: a contract (e.g. CTR-00004, agreed 999,000 kg) may end
-- up with delivery_allocations summing to more than its agreed quantity.
--
-- Investigation from this environment (no direct DB/service-role access
-- available here — only the anon key, which RLS correctly blocks from
-- reading contracts/deliveries) found that the current write path,
-- record_contractual_delivery() (migration 042), already computes each
-- contract's remaining capacity from the live SUM of its non-Rejected
-- delivery_allocations and caps every new allocation with
-- LEAST(available_kg, remaining_kg) while holding a row lock
-- (SELECT ... FOR UPDATE) on the contract for the duration of the call —
-- so a single call, and concurrent calls against the same supplier's
-- contracts, cannot overshoot the agreed quantity through that path.
--
-- However nothing at the database layer actually PREVENTS a different
-- write path (a manual SQL fix, a future feature, the historical
-- pre-migration-042 client-side insert flow, etc.) from inserting an
-- over-cap allocation — the invariant "allocated <= agreed" was only ever
-- upheld by that one function's arithmetic, never enforced as a hard
-- constraint. This migration closes that gap and adds read-only
-- diagnostic functions so the real, current numbers for any contract
-- (including CTR-00004) can be inspected directly via the SQL editor,
-- where live data is actually reachable.
--
-- This migration does NOT modify any existing contract, delivery,
-- delivery_allocations, or payment rows — it only (a) prevents any
-- FUTURE insert/update from exceeding a contract's agreed quantity, and
-- (b) exposes two SECURITY DEFINER, read-only functions for inspecting
-- current allocation totals. Any existing over-allocated rows found via
-- these functions must be reviewed and corrected manually (per payment/
-- history-preservation rules) — this migration intentionally does not
-- guess at or auto-correct historical data it cannot verify.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Hard invariant: no delivery_allocations row (for rows actually tied
--    to a contract; NULL contract_id = uncapped Spot overflow) may push
--    that contract's total non-Rejected allocated weight past its
--    agreed quantity (contracted_tons * 1000, with a 0.01kg rounding
--    tolerance). Fires on INSERT and UPDATE, covering every write path.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_delivery_allocation_cap()
RETURNS TRIGGER AS $$
DECLARE
  v_contracted_kg   DECIMAL(12,3);
  v_existing_kg     DECIMAL(12,3);
  v_delivery_status public.delivery_status_enum;
BEGIN
  -- NULL contract_id = the uncapped Spot-price overflow portion of a
  -- delivery; never subject to a contract's agreed-quantity cap.
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT delivery_status INTO v_delivery_status
  FROM public.deliveries WHERE delivery_id = NEW.delivery_id;

  -- A Rejected delivery's allocation never counts against contract capacity
  -- (matches the existing convention used throughout the app/RPC).
  IF v_delivery_status = 'Rejected' THEN
    RETURN NEW;
  END IF;

  SELECT (contracted_tons * 1000)::DECIMAL(12,3) INTO v_contracted_kg
  FROM public.contracts WHERE contract_id = NEW.contract_id;

  -- Sum every OTHER non-Rejected allocation already committed to this
  -- contract (excluding this exact row, relevant for UPDATE).
  SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
  INTO v_existing_kg
  FROM public.delivery_allocations da
  JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  WHERE da.contract_id = NEW.contract_id
    AND d.delivery_status <> 'Rejected'
    AND da.allocation_id IS DISTINCT FROM NEW.allocation_id;

  IF v_existing_kg + NEW.allocated_weight_kg > v_contracted_kg + 0.01 THEN
    RAISE EXCEPTION
      'Allocation of % kg to contract % would exceed its agreed quantity of % kg (already allocated: % kg). Over-allocation is not permitted.',
      NEW.allocated_weight_kg, NEW.contract_id, v_contracted_kg, v_existing_kg
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_enforce_delivery_allocation_cap ON public.delivery_allocations;
CREATE TRIGGER trigger_enforce_delivery_allocation_cap
  BEFORE INSERT OR UPDATE ON public.delivery_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_delivery_allocation_cap();

-- ------------------------------------------------------------
-- 2. Read-only reconciliation report: one row per contract with its
--    agreed quantity, currently allocated quantity (non-Rejected), and
--    any excess. Run this in the SQL editor to see the real, current
--    numbers for CTR-00004 (or every contract) before deciding on any
--    manual correction — this sandbox cannot query it directly.
--    No GRANT is added: intentionally restricted to whoever runs it
--    with DB/SQL-editor access (not exposed to the app or its users).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.contract_allocation_reconciliation()
RETURNS TABLE (
  contract_id     UUID,
  contract_number VARCHAR,
  supplier_name   TEXT,
  contract_status public.contract_status_enum,
  contracted_kg   DECIMAL,
  allocated_kg    DECIMAL,
  excess_kg       DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.contract_id,
    c.contract_number,
    u.first_name || ' ' || u.last_name AS supplier_name,
    c.status,
    (c.contracted_tons * 1000)::DECIMAL(12,3) AS contracted_kg,
    COALESCE(SUM(da.allocated_weight_kg) FILTER (WHERE d.delivery_status <> 'Rejected'), 0)::DECIMAL(12,3) AS allocated_kg,
    GREATEST(
      0,
      COALESCE(SUM(da.allocated_weight_kg) FILTER (WHERE d.delivery_status <> 'Rejected'), 0)
        - (c.contracted_tons * 1000)
    )::DECIMAL(12,3) AS excess_kg
  FROM public.contracts c
  JOIN public.users u ON u.user_id = c.supplier_id
  LEFT JOIN public.delivery_allocations da ON da.contract_id = c.contract_id
  LEFT JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  GROUP BY c.contract_id, c.contract_number, u.first_name, u.last_name, c.status, c.contracted_tons
  ORDER BY excess_kg DESC, c.created_at DESC;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default on new functions — revoke
-- it so this diagnostic tool is never callable by the app or its users,
-- only by whoever runs it directly with DB/SQL-editor access.
REVOKE ALL ON FUNCTION public.contract_allocation_reconciliation() FROM PUBLIC;

-- ------------------------------------------------------------
-- 3. Read-only allocation detail for one contract: every delivery
--    allocation row contributing to its total, so an over-allocated
--    contract can be traced back to the exact deliveries responsible.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.contract_allocation_detail(p_contract_id UUID)
RETURNS TABLE (
  allocation_id       UUID,
  delivery_id         UUID,
  delivery_date       DATE,
  delivery_status     public.delivery_status_enum,
  allocated_weight_kg DECIMAL,
  price_type          public.price_type_enum,
  sequence_order      INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT da.allocation_id, da.delivery_id, d.delivery_date, d.delivery_status,
         da.allocated_weight_kg, da.price_type, da.sequence_order
  FROM public.delivery_allocations da
  JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  WHERE da.contract_id = p_contract_id
  ORDER BY d.delivery_date ASC, da.sequence_order ASC;
$$;

-- Same lockdown as above — developer/SQL-editor use only.
REVOKE ALL ON FUNCTION public.contract_allocation_detail(UUID) FROM PUBLIC;
