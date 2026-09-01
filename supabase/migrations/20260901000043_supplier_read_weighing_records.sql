-- Allow Suppliers to read weighing_records for their own deliveries.
-- Previously the policy only allowed the weigher who recorded it + BO + Lab Staff,
-- which caused weighing data to return empty on the Supplier Deliveries page.

DROP POLICY IF EXISTS "weighing_records_select" ON public.weighing_records;

CREATE POLICY "weighing_records_select" ON public.weighing_records
  FOR SELECT USING (
    weigher_id = auth.uid()
    OR public.get_my_role() IN ('Business Owner', 'Laboratory Staff')
    OR EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.delivery_id = weighing_records.delivery_id
        AND d.supplier_id = auth.uid()
    )
  );
