-- Allow suppliers (and all authenticated users) to read the basic profile
-- (first_name, last_name) of Weigher and Laboratory Staff accounts.
-- This is needed so the Supplier Deliveries page can display who weighed
-- their delivery and who performed the lab inspection.
-- Only name/role data is exposed — no sensitive fields (email, phone, bank, etc.)
-- are selected by the delivery query.

CREATE POLICY "users_select_staff_by_supplier" ON public.users
  FOR SELECT USING (
    public.get_my_role() = 'Supplier'
    AND EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.role_id = users.role_id
        AND r.role_name IN ('Weigher', 'Laboratory Staff')
    )
  );
