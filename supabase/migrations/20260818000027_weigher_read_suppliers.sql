-- ============================================================
-- Migration 027: Allow Weigher and Lab Staff to read Supplier users
-- ============================================================
-- Weigher and Lab Staff need to read Supplier users to:
-- - Weigher: search and select suppliers for delivery recording
-- - Lab Staff: (future) link suppliers to deliveries
-- ============================================================

CREATE POLICY "users_select_weigher_suppliers" ON public.users
  FOR SELECT
  USING (
    -- Weigher and Lab Staff can read Active Supplier users
    public.get_my_role() IN ('Weigher', 'Laboratory Staff')
    AND account_status = 'Active'
    AND EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.role_id = public.users.role_id
        AND r.role_name = 'Supplier'
    )
  );
