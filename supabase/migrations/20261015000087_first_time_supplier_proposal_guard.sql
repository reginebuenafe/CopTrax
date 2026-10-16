-- SEPARATE / OPTIONAL DEPLOYMENT: first-time supplier proposal-insert guard.
-- Applies only to supplier-submitted INSERTs. No existing policies, proposal
-- update/accept/reject paths, BO offers, or contract logic are modified.
CREATE OR REPLACE FUNCTION public.guard_first_time_supplier_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supplier_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Use the authenticated role, not client-controlled submitted_by, so a
    -- supplier cannot bypass this guard by impersonating the BO in the row.
    IF public.get_my_role() IS DISTINCT FROM 'Supplier' THEN RETURN NEW; END IF;
    v_supplier_id := auth.uid();
  ELSE
    -- Preserve service-role BO/AI inserts; also cover trusted callers which
    -- explicitly insert on behalf of the supplier.
    IF NEW.submitted_by IS DISTINCT FROM NEW.supplier_id THEN RETURN NEW; END IF;
    v_supplier_id := NEW.supplier_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.supplier_id = v_supplier_id) THEN
    RAISE EXCEPTION 'First-time suppliers receive spot price-based offers and may accept or decline them. They cannot submit proposals or counteroffers until they have a contract.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_first_time_supplier_proposal() FROM PUBLIC;

DROP TRIGGER IF EXISTS aa_first_time_supplier_proposal_guard ON public.proposal_forms;
CREATE TRIGGER aa_first_time_supplier_proposal_guard
BEFORE INSERT ON public.proposal_forms
FOR EACH ROW EXECUTE FUNCTION public.guard_first_time_supplier_proposal();
