-- Allow any authenticated active user to read the Business Owner profile.
-- Needed so Supplier can look up the BO's user_id when starting a negotiation.
CREATE POLICY "users_select_business_owner"
  ON public.users
  FOR SELECT
  USING (
    -- Any logged-in user can see rows where that row's role is Business Owner
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.role_id = public.users.role_id
        AND r.role_name = 'Business Owner'
    )
  );
