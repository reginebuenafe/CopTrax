-- Allow weighers to flag a saved delivery for Business Owner or lab review.
CREATE TABLE IF NOT EXISTS public.delivery_issue_reports (
  issue_report_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  issue_note TEXT NOT NULL CHECK (char_length(btrim(issue_note)) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Review', 'Resolved')),
  reviewed_by UUID REFERENCES public.users(user_id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_issue_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_issue_reports_select" ON public.delivery_issue_reports;
CREATE POLICY "delivery_issue_reports_select" ON public.delivery_issue_reports
  FOR SELECT USING (
    reported_by = auth.uid()
    OR public.get_my_role() IN ('Business Owner', 'Laboratory Staff')
  );

DROP POLICY IF EXISTS "delivery_issue_reports_insert" ON public.delivery_issue_reports;
CREATE POLICY "delivery_issue_reports_insert" ON public.delivery_issue_reports
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'Weigher' AND reported_by = auth.uid()
  );

DROP POLICY IF EXISTS "delivery_issue_reports_update" ON public.delivery_issue_reports;
CREATE POLICY "delivery_issue_reports_update" ON public.delivery_issue_reports
  FOR UPDATE USING (public.get_my_role() IN ('Business Owner', 'Laboratory Staff'))
  WITH CHECK (public.get_my_role() IN ('Business Owner', 'Laboratory Staff'));
