-- Provide the authenticated Owner UI with a protected audit-log write path.
-- Server-side Edge Functions continue to insert through the service role.
CREATE OR REPLACE FUNCTION public.record_audit_log(
  p_action TEXT,
  p_entity_type VARCHAR(50),
  p_entity_id UUID DEFAULT NULL
)
RETURNS public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_row public.audit_logs;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can create audit logs'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id)
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit_log(TEXT, VARCHAR(50), UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_audit_log(TEXT, VARCHAR(50), UUID) TO authenticated;
