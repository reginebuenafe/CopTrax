-- ============================================================
-- Migration 002: Functions and Triggers
-- ============================================================

-- ============================================================
-- HELPER: get the role name of the currently authenticated user
-- Used by RLS policies in migration 003.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.role_name
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE u.user_id = auth.uid()
$$;

-- ============================================================
-- TRIGGER: create a public.users row when a new auth user signs up
-- Role name is passed as raw_user_meta_data->>'role' during signUp().
-- Business Owner is seeded directly — this trigger handles self-registered roles.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id INTEGER;
  v_status  public.account_status_enum;
BEGIN
  SELECT role_id INTO v_role_id
  FROM public.roles
  WHERE role_name = NEW.raw_user_meta_data->>'role';

  -- Business Owner is always Active (seeded); everyone else starts Pending
  v_status := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'Business Owner' THEN 'Active'
    ELSE 'Pending'
  END;

  INSERT INTO public.users (user_id, role_id, email, account_status, created_at)
  VALUES (NEW.id, v_role_id, NEW.email, v_status, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- FUNCTION: generate sequential contract numbers (CTR-00001, etc.)
-- Called by the Edge Function that creates a contract from an accepted proposal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_contract_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(REGEXP_REPLACE(contract_number, '[^0-9]', '', 'g') AS INTEGER)), 0
  ) + 1
  INTO next_num
  FROM public.contracts;

  RETURN 'CTR-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

-- ============================================================
-- FUNCTION: flip walk-in batches to 'Ready to Merge' once eligible.
-- Called daily by pg_cron / Supabase Scheduled Function.
-- Inserts a notification for the Business Owner for each newly eligible batch.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_merge_eligibility()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch    RECORD;
  owner_id UUID;
BEGIN
  SELECT u.user_id INTO owner_id
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE r.role_name = 'Business Owner'
    AND u.account_status = 'Active'
  LIMIT 1;

  FOR batch IN
    SELECT *
    FROM public.inventory_batches
    WHERE source_type = 'Walkin'
      AND batch_status = 'Walk-in Holding'
      AND merge_eligible_date IS NOT NULL
      AND merge_eligible_date <= CURRENT_DATE
  LOOP
    UPDATE public.inventory_batches
    SET batch_status = 'Ready to Merge'
    WHERE inventory_batch_id = batch.inventory_batch_id;

    IF owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        owner_id,
        'Merge Ready',
        batch.weight_kg || ' kg walk-in copra is ready to merge into Resecada. Review and approve.',
        'inventory_batches',
        batch.inventory_batch_id
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- FUNCTION: compute and store a supplier performance snapshot
-- when a contract transitions to Completed or Breached.
-- Weights: 60% Fulfillment + 20% Volume + 20% Quality.
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_supplier_rating(p_contract_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract          RECORD;
  v_fulfillment_score DECIMAL(5,2);
  v_volume_score      DECIMAL(5,2);
  v_quality_score     DECIMAL(5,2);
  v_perf_score        DECIMAL(5,2);
  v_rating            INTEGER;
  v_overall           DECIMAL(3,2);
  v_total_kg          DECIMAL(12,3);
  v_avg_moisture      DECIMAL(5,2);
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE contract_id = p_contract_id;

  -- Contract Fulfillment (60%): 100 if Completed on/before due date, 0 if Breached
  v_fulfillment_score := CASE v_contract.status
    WHEN 'Completed' THEN 100.0
    WHEN 'Breached'  THEN   0.0
    ELSE 0.0
  END;

  -- Delivered Volume (20%): total net kg across accepted contractual deliveries
  SELECT COALESCE(SUM(wr.net_weight_kg), 0) INTO v_total_kg
  FROM public.deliveries d
  JOIN public.weighing_records wr ON wr.delivery_id = d.delivery_id
  WHERE d.contract_id = p_contract_id
    AND d.delivery_status = 'Accepted';

  v_volume_score := CASE
    WHEN v_total_kg >= 50000 THEN 100.0  -- ≥50 tons
    WHEN v_total_kg >= 40000 THEN  80.0
    WHEN v_total_kg >= 30000 THEN  60.0
    WHEN v_total_kg >= 20000 THEN  40.0
    ELSE                           20.0  -- ≤10 tons
  END;

  -- Copra Quality (20%): average moisture content of accepted deliveries
  SELECT COALESCE(AVG(li.moisture_content_pct), 0) INTO v_avg_moisture
  FROM public.deliveries d
  JOIN public.laboratory_inspections li ON li.delivery_id = d.delivery_id
  WHERE d.contract_id = p_contract_id
    AND d.delivery_status = 'Accepted';

  v_quality_score := CASE
    WHEN v_avg_moisture  > 20.2 THEN   0.0  -- Rejected
    WHEN v_avg_moisture >= 10.5 THEN  20.0
    WHEN v_avg_moisture >=  9.5 THEN  40.0
    WHEN v_avg_moisture >=  8.5 THEN  60.0
    WHEN v_avg_moisture >=  7.5 THEN  80.0
    ELSE                              100.0  -- 6.5–7.4%
  END;

  v_perf_score := (v_fulfillment_score * 0.6)
                + (v_volume_score      * 0.2)
                + (v_quality_score     * 0.2);

  v_rating := CASE
    WHEN v_perf_score >= 90 THEN 5
    WHEN v_perf_score >= 70 THEN 4
    WHEN v_perf_score >= 50 THEN 3
    WHEN v_perf_score >= 30 THEN 2
    ELSE 1
  END;

  -- Overall rating = average of all per-contract ratings for this supplier
  SELECT ROUND(AVG(sps.supplier_rating), 2) INTO v_overall
  FROM public.supplier_performance_snapshot sps
  WHERE sps.supplier_id = v_contract.supplier_id;

  -- Weighted average including this new rating
  v_overall := ROUND(
    COALESCE(
      (v_overall * (SELECT COUNT(*) FROM public.supplier_performance_snapshot WHERE supplier_id = v_contract.supplier_id)
       + v_rating)
      / NULLIF((SELECT COUNT(*) FROM public.supplier_performance_snapshot WHERE supplier_id = v_contract.supplier_id) + 1, 0),
      v_rating
    ), 2
  );

  INSERT INTO public.supplier_performance_snapshot (
    supplier_id, contract_id, snapshot_date,
    contract_fulfillment_score, delivered_volume_score, copra_quality_score,
    performance_score, supplier_rating, overall_supplier_rating
  ) VALUES (
    v_contract.supplier_id, p_contract_id, CURRENT_DATE,
    v_fulfillment_score, v_volume_score, v_quality_score,
    v_perf_score, v_rating, v_overall
  );
END;
$$;

-- ============================================================
-- TRIGGER: auto-compute supplier rating when contract is Completed/Breached
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_contract_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('Completed', 'Breached') AND OLD.status NOT IN ('Completed', 'Breached') THEN
    PERFORM public.compute_supplier_rating(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_contract_status_change
  AFTER UPDATE OF status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_contract_status_change();

-- ============================================================
-- TRIGGER: when a walk-in inventory batch is created,
-- notify the Business Owner (Merge Pending) and set merge_eligible_date.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_walkin_batch_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
BEGIN
  IF NEW.source_type = 'Walkin' THEN
    -- Set merge eligibility to 14 calendar days from record date
    NEW.merge_eligible_date := NEW.recorded_date + INTERVAL '14 days';

    SELECT u.user_id INTO owner_id
    FROM public.users u
    JOIN public.roles r ON r.role_id = u.role_id
    WHERE r.role_name = 'Business Owner'
      AND u.account_status = 'Active'
    LIMIT 1;

    IF owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        owner_id,
        'Merge Pending',
        NEW.weight_kg || ' kg walk-in copra recorded on ' || NEW.recorded_date ||
        ', eligible to merge into Resecada on ' || NEW.merge_eligible_date || '.',
        'inventory_batches',
        NEW.inventory_batch_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_walkin_batch_created
  BEFORE INSERT ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.handle_walkin_batch_created();
