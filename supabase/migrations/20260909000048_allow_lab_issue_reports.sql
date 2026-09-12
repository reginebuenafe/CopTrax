-- Allow Lab Staff to report delivery or inspection issues using the existing report table.
DROP POLICY IF EXISTS "delivery_issue_reports_insert" ON public.delivery_issue_reports;

CREATE POLICY "delivery_issue_reports_insert" ON public.delivery_issue_reports
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('Weigher', 'Laboratory Staff')
    AND reported_by = auth.uid()
  );