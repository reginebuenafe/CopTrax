-- Correct the scope of migration 087: first-time suppliers may initiate a
-- proposal. Only their counteroffers (a supersedes_proposal_id) are blocked.
-- The existing trigger, RLS, active-contract limits, BO/AI behavior, and
-- accept/reject UPDATE paths are unchanged. Apply separately to the database.
CREATE OR REPLACE FUNCTION public.guard_first_time_supplier_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supplier_id uuid;
BEGIN
  IF NEW.supersedes_proposal_id IS NULL THEN RETURN NEW; END IF;

  IF auth.uid() IS NOT NULL THEN
    IF public.get_my_role() IS DISTINCT FROM 'Supplier' THEN RETURN NEW; END IF;
    v_supplier_id := auth.uid();
  ELSE
    IF NEW.submitted_by IS DISTINCT FROM NEW.supplier_id THEN RETURN NEW; END IF;
    v_supplier_id := NEW.supplier_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.supplier_id = v_supplier_id) THEN
    RAISE EXCEPTION 'First-time suppliers can submit price proposals, but cannot counter an offer. You can accept or decline this offer.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_first_time_supplier_proposal() FROM PUBLIC;
