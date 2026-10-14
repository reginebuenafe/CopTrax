-- Fixes a regression introduced by migration 085: its new contracts_select
-- policy added a correlated EXISTS subquery against public.deliveries, but
-- the existing deliveries_select policy (migration 003) itself contains an
-- EXISTS subquery against public.contracts — Postgres detects this as
-- infinite recursion (error 42P17) when planning any contracts query.
--
-- Fix: move the "is this contract relevant to this Laboratory Staff
-- member's Weighed queue or own inspection history" check into a
-- SECURITY DEFINER helper function. Its internal queries run as the
-- function owner and are therefore NOT re-evaluated through
-- deliveries_select's own RLS policy, breaking the circular reference.
-- The actual visibility rule (same contracts as migration 085, same
-- Active-only scope, same two query paths) is unchanged.

CREATE OR REPLACE FUNCTION public.lab_staff_contract_visible(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = p_contract_id
      AND (
        d.delivery_status = 'Weighed'
        OR EXISTS (
          SELECT 1 FROM public.laboratory_inspections li
          WHERE li.delivery_id = d.delivery_id AND li.lab_staff_id = auth.uid()
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.lab_staff_contract_visible(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lab_staff_contract_visible(UUID) TO authenticated;

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    supplier_id = auth.uid()
    OR business_owner_id = auth.uid()
    OR (
      public.get_my_role() = 'Laboratory Staff'
      AND status = 'Active'
      AND public.lab_staff_contract_visible(contract_id)
    )
  );
