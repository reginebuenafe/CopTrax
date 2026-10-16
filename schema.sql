


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."account_status_enum" AS ENUM (
    'Pending',
    'Active',
    'Rejected',
    'Deleted'
);


ALTER TYPE "public"."account_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."contract_status_enum" AS ENUM (
    'Pending',
    'Signed',
    'Active',
    'Completed',
    'Breached',
    'Pending Owner Review'
);


ALTER TYPE "public"."contract_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."conversation_status_enum" AS ENUM (
    'Open',
    'Closed',
    'Terminated'
);


ALTER TYPE "public"."conversation_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."delivery_source_enum" AS ENUM (
    'Walkin',
    'Contract-based'
);


ALTER TYPE "public"."delivery_source_enum" OWNER TO "postgres";


CREATE TYPE "public"."delivery_status_enum" AS ENUM (
    'Pending',
    'Weighed',
    'Inspected',
    'Accepted',
    'Rejected'
);


ALTER TYPE "public"."delivery_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."file_category_enum" AS ENUM (
    'Gov ID',
    'Face ID',
    'E-Sign',
    'Contract Doc',
    'Receipt',
    'Bank QR',
    'Other'
);


ALTER TYPE "public"."file_category_enum" OWNER TO "postgres";


CREATE TYPE "public"."inventory_batch_status_enum" AS ENUM (
    'Walk-in Holding',
    'Ready to Merge',
    'Resecada'
);


ALTER TYPE "public"."inventory_batch_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."inventory_source_type_enum" AS ENUM (
    'Contractual',
    'Walkin'
);


ALTER TYPE "public"."inventory_source_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."login_status_enum" AS ENUM (
    'Success',
    'Failed'
);


ALTER TYPE "public"."login_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."message_type_enum" AS ENUM (
    'Text',
    'Image',
    'File',
    'Contract Form'
);


ALTER TYPE "public"."message_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."notification_type_enum" AS ENUM (
    'Contract Signed',
    'Contract Activated',
    'Delivery Accepted',
    'Delivery Rejected',
    'Weekly Payment Ready',
    'Payment Released',
    'Contract Completed',
    'Contract Breached',
    'Deadline Reminder',
    'Merge Pending',
    'Merge Ready',
    'Merge Completed',
    'Other',
    'New Proposal',
    'Counteroffer',
    'Proposal Rejected',
    'Contract Generated',
    'Bank Change Requested',
    'Bank Change Approved',
    'Bank Change Rejected',
    'Proposal Accepted',
    'Counteroffer Received',
    'Merge Tomorrow',
    'Account Approved',
    'Account Rejected',
    'Payment Failed',
    'Inventory Capacity Warning',
    'Supplier Assistance Requested'
);


ALTER TYPE "public"."notification_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."payment_method_enum" AS ENUM (
    'Cash',
    'Bank Transfer'
);


ALTER TYPE "public"."payment_method_enum" OWNER TO "postgres";


CREATE TYPE "public"."payment_status_enum" AS ENUM (
    'Pending',
    'Released',
    'Failed',
    'Processing'
);


ALTER TYPE "public"."payment_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."price_type_enum" AS ENUM (
    'Negotiated',
    'Spot'
);


ALTER TYPE "public"."price_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."proposal_status_enum" AS ENUM (
    'Pending',
    'Accepted',
    'Rejected',
    'Modified'
);


ALTER TYPE "public"."proposal_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."quality_result_enum" AS ENUM (
    'Accepted',
    'Rejected'
);


ALTER TYPE "public"."quality_result_enum" OWNER TO "postgres";


CREATE TYPE "public"."review_decision_enum" AS ENUM (
    'Approved',
    'Held'
);


ALTER TYPE "public"."review_decision_enum" OWNER TO "postgres";


CREATE TYPE "public"."signer_role_enum" AS ENUM (
    'Supplier',
    'Business Owner'
);


ALTER TYPE "public"."signer_role_enum" OWNER TO "postgres";


CREATE TYPE "public"."transaction_type_enum" AS ENUM (
    'Stock In',
    'Merge to Resecada',
    'Stock Out',
    'Adjustment'
);


ALTER TYPE "public"."transaction_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."verify_status_enum" AS ENUM (
    'Pending',
    'Approved',
    'Rejected'
);


ALTER TYPE "public"."verify_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_counteroffer_and_create_contract"("p_proposal_id" "uuid", "p_supplier_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.proposal_forms
                 WHERE proposal_id = p_proposal_id AND supplier_id = p_supplier_id) THEN
    RAISE EXCEPTION 'You can only accept proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;
  RETURN public.accept_negotiation_and_create_contract(p_proposal_id, p_supplier_id);
END;
$$;


ALTER FUNCTION "public"."accept_counteroffer_and_create_contract"("p_proposal_id" "uuid", "p_supplier_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_negotiation_and_create_contract"("p_proposal_id" "uuid", "p_actor_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_proposal public.proposal_forms%ROWTYPE;
  v_conv public.conversations%ROWTYPE;
  v_latest UUID;
  v_submitter UUID;
  v_contract_id UUID;
  v_status public.contract_status_enum;
  v_number TEXT;
BEGIN
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_proposal.conversation_id::text));
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  SELECT * INTO v_conv FROM public.conversations WHERE conversation_id = v_proposal.conversation_id;
  IF p_actor_id IS NULL OR p_actor_id NOT IN (v_conv.supplier_id, v_conv.business_owner_id) THEN
    RAISE EXCEPTION 'You can only accept proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;
  SELECT proposal_id INTO v_latest FROM public.proposal_forms
   WHERE conversation_id = v_conv.conversation_id
   ORDER BY submitted_at DESC, proposal_id DESC LIMIT 1;
  IF v_latest IS DISTINCT FROM p_proposal_id THEN
    RAISE EXCEPTION 'This offer is no longer the current proposal. Refresh the conversation.' USING ERRCODE = '22023';
  END IF;
  v_submitter := v_proposal.submitted_by;
  IF v_submitter IS NULL THEN
    SELECT CASE WHEN count(*) % 2 = 0 THEN v_conv.supplier_id ELSE v_conv.business_owner_id END
      INTO v_submitter FROM public.proposal_forms
     WHERE conversation_id = v_conv.conversation_id
       AND (submitted_at, proposal_id) < (v_proposal.submitted_at, v_proposal.proposal_id);
  END IF;
  IF v_submitter = p_actor_id THEN
    RAISE EXCEPTION 'Only the recipient can accept this offer.' USING ERRCODE = '42501';
  END IF;
  SELECT contract_id INTO v_contract_id FROM public.contracts WHERE source_proposal_id = p_proposal_id;
  IF FOUND THEN RETURN v_contract_id; END IF;

  IF v_proposal.proposal_status NOT IN ('Pending', 'Accepted') THEN
    RAISE EXCEPTION 'Proposal is not Pending (current: %)', v_proposal.proposal_status USING ERRCODE = '22023';
  END IF;
  IF v_proposal.proposal_status = 'Accepted' AND v_conv.contract_id IS NOT NULL THEN
    -- Legacy contracts have no source_proposal_id; reuse, never duplicate them.
    SELECT contract_id INTO v_contract_id FROM public.contracts
     WHERE contract_id = v_conv.contract_id AND source_proposal_id IS NULL
       AND negotiated_price_per_kg = v_proposal.proposed_price_per_kg
       AND contracted_tons = v_proposal.proposed_volume_tons;
    IF FOUND THEN RETURN v_contract_id; END IF;
  END IF;
  IF v_conv.status = 'Terminated' THEN
    RAISE EXCEPTION 'Conversation is terminated.' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_status FROM public.contracts WHERE contract_id = v_conv.contract_id;
  IF v_status IN ('Pending', 'Pending Owner Review') THEN
    RAISE EXCEPTION 'A pending contract already exists for this conversation.' USING ERRCODE = '23505';
  END IF;
  UPDATE public.proposal_forms
     SET proposal_status = 'Accepted',
         reviewed_by = CASE WHEN p_actor_id = v_conv.business_owner_id THEN p_actor_id ELSE reviewed_by END
   WHERE proposal_id = p_proposal_id AND proposal_status = 'Pending';
  UPDATE public.proposal_forms SET proposal_status = 'Modified'
   WHERE conversation_id = v_conv.conversation_id AND proposal_status = 'Pending'
     AND proposal_id <> p_proposal_id;
  -- The existing number generator is MAX-based and also needs serialization.
  PERFORM pg_advisory_xact_lock(hashtextextended('negotiation-contract-number', 0));
  SELECT public.generate_contract_number() INTO v_number;
  INSERT INTO public.contracts (
    contract_number, supplier_id, business_owner_id, negotiated_price_per_kg,
    contracted_tons, signing_date, status, source_proposal_id
  ) VALUES (
    v_number, v_conv.supplier_id, v_conv.business_owner_id, v_proposal.proposed_price_per_kg,
    v_proposal.proposed_volume_tons, CURRENT_DATE, 'Pending', p_proposal_id
  ) RETURNING contract_id INTO v_contract_id;
  UPDATE public.conversations SET contract_id = v_contract_id WHERE conversation_id = v_conv.conversation_id;
  RETURN v_contract_id;
END;
$$;


ALTER FUNCTION "public"."accept_negotiation_and_create_contract"("p_proposal_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_delivery_correction"("p_issue_report_id" "uuid", "p_corrected_value" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_issue              public.delivery_issue_reports;
  v_delivery           public.deliveries;
  v_old_value          NUMERIC;
  v_weighing_id        UUID;
  v_inspection_id      UUID;
  v_quality_id         UUID;
  v_quality_result     public.quality_result_enum;
  v_current_mc         NUMERIC;
  v_rounded_mc         DECIMAL(4,1);
  v_discount_pct       NUMERIC := 0;
  v_new_final_kg       NUMERIC;
  v_payment_id         UUID;
  v_payment_status     TEXT;
  v_payment_note       TEXT := NULL;
  v_result_json        JSONB;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can apply a correction' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_issue FROM public.delivery_issue_reports WHERE issue_report_id = p_issue_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue report not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.status = 'Resolved' THEN
    RAISE EXCEPTION 'This issue has already been resolved' USING ERRCODE = '22023';
  END IF;
  IF v_issue.issue_type NOT IN ('Weight Correction', 'MC Correction') THEN
    RAISE EXCEPTION 'This issue type does not support a direct correction' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery FROM public.deliveries WHERE delivery_id = v_issue.delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_corrected_value IS NULL OR p_corrected_value <= 0 THEN
    RAISE EXCEPTION 'Corrected value must be greater than zero' USING ERRCODE = '22023';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  IF v_issue.issue_type = 'Weight Correction' THEN
    SELECT weighing_id, net_weight_kg INTO v_weighing_id, v_old_value
    FROM public.weighing_records
    WHERE delivery_id = v_delivery.delivery_id
    ORDER BY weighed_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No weighing record found for this delivery' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.weighing_records SET net_weight_kg = p_corrected_value WHERE weighing_id = v_weighing_id;

    IF v_delivery.delivery_source = 'Contract-based' THEN
      -- Reuses the existing Final-Weight cascade engine: it reads the
      -- (now-corrected) Net Weight + current MC fresh from the DB, so
      -- correcting weighing_records above is all that's needed for it to
      -- recompute the right split.
      PERFORM public.recompute_delivery_allocation(v_delivery.delivery_id);

      v_new_final_kg := (
        SELECT COALESCE(SUM(allocated_weight_kg), 0)
        FROM public.delivery_allocations
        WHERE delivery_id = v_delivery.delivery_id
      );

      UPDATE public.inventory_batches
      SET weight_kg = v_new_final_kg
      WHERE delivery_id = v_delivery.delivery_id;
    ELSE
      -- Walk-in: weighing_records.net_weight_kg already IS the final
      -- payable weight (post sacks/wet deduction) per WalkinDeliveryForm —
      -- there is no separate lab/PCA step to recompute.
      v_new_final_kg := p_corrected_value;

      UPDATE public.deliveries
      SET walkin_amount_paid = ROUND(v_new_final_kg * walkin_spot_price_kg, 2)
      WHERE delivery_id = v_delivery.delivery_id;

      UPDATE public.inventory_batches
      SET weight_kg = v_new_final_kg
      WHERE delivery_id = v_delivery.delivery_id;
    END IF;

  -- ──────────────────────────────────────────────────────────────────────
  ELSIF v_issue.issue_type = 'MC Correction' THEN
    -- MC Correction only ever applies to Contract-based deliveries — Lab
    -- Staff never assesses Walk-in deliveries (InspectionQueuePage.jsx
    -- only ever queues Contract-based, 'Weighed' deliveries).
    IF v_delivery.delivery_source <> 'Contract-based' THEN
      RAISE EXCEPTION 'MC Correction only applies to contractual deliveries' USING ERRCODE = '22023';
    END IF;

    IF p_corrected_value > 20.2 THEN
      RAISE EXCEPTION 'A corrected MC above 20.2cc would reject this delivery. This correction flow only supports values that keep the delivery Accepted.' USING ERRCODE = '22023';
    END IF;

    SELECT qr.quality_id, qr.inspection_id, li.moisture_content_pct, qr.result
    INTO v_quality_id, v_inspection_id, v_current_mc, v_quality_result
    FROM public.quality_results qr
    JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
    WHERE qr.delivery_id = v_delivery.delivery_id
    ORDER BY qr.evaluated_at DESC
    LIMIT 1
    FOR UPDATE OF qr;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No quality result found for this delivery' USING ERRCODE = 'P0002';
    END IF;

    IF v_quality_result <> 'Accepted' THEN
      RAISE EXCEPTION 'This delivery is currently Rejected. This correction flow only supports adjusting the MC of an Accepted delivery — reversing a rejection requires a separate, more involved workflow.' USING ERRCODE = '22023';
    END IF;

    v_old_value := v_current_mc;

    UPDATE public.laboratory_inspections SET moisture_content_pct = p_corrected_value WHERE inspection_id = v_inspection_id;

    -- Same deterministic PCA lookup convention used everywhere else
    -- (InspectionQueuePage.jsx, recompute_delivery_allocation()): MC < 5.0
    -- → 0%, else round to nearest 0.1 and look up the table, default 0%.
    IF p_corrected_value < 5.0 THEN
      v_discount_pct := 0;
    ELSE
      v_rounded_mc := ROUND(p_corrected_value, 1);
      SELECT discount_value INTO v_discount_pct FROM public.pca_discount_table WHERE moisture_content_pct = v_rounded_mc;
      v_discount_pct := COALESCE(v_discount_pct, 0);
    END IF;

    UPDATE public.quality_results
    SET remarks = 'Moisture content ' || p_corrected_value || 'cc. Deduction: ' || v_discount_pct || '%. (Corrected by Business Owner.)'
    WHERE quality_id = v_quality_id;

    PERFORM public.recompute_delivery_allocation(v_delivery.delivery_id);

    v_new_final_kg := (
      SELECT COALESCE(SUM(allocated_weight_kg), 0)
      FROM public.delivery_allocations
      WHERE delivery_id = v_delivery.delivery_id
    );

    UPDATE public.inventory_batches
    SET weight_kg = v_new_final_kg
    WHERE delivery_id = v_delivery.delivery_id;
  END IF;

  -- ── Keep a still-Pending payment in sync (money not yet sent) ─────────
  -- A delivery is batched as a whole (create_payment_batch inserts every
  -- allocation line for it into ONE payment), so at most one payment_id
  -- is expected here in practice.
  IF v_delivery.delivery_source = 'Contract-based' THEN
    SELECT DISTINCT pd.payment_id INTO v_payment_id
    FROM public.payment_details pd
    WHERE pd.delivery_id = v_delivery.delivery_id
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      SELECT payment_status INTO v_payment_status FROM public.payments WHERE payment_id = v_payment_id FOR UPDATE;

      IF v_payment_status = 'Pending' THEN
        -- Current MC (freshly re-read — correct whether this was a Weight
        -- Correction, which leaves MC unchanged, or an MC Correction,
        -- which already updated it above) drives the same deterministic
        -- PCA lookup used everywhere else, so each allocation line's
        -- informational Net/Deducted figures reverse-derive consistently
        -- with computeLine()'s convention on the Payments page.
        SELECT li.moisture_content_pct INTO v_current_mc
        FROM public.quality_results qr
        JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
        WHERE qr.delivery_id = v_delivery.delivery_id
        ORDER BY qr.evaluated_at DESC
        LIMIT 1;

        IF v_current_mc < 5.0 THEN
          v_discount_pct := 0;
        ELSE
          v_rounded_mc := ROUND(v_current_mc, 1);
          SELECT discount_value INTO v_discount_pct FROM public.pca_discount_table WHERE moisture_content_pct = v_rounded_mc;
          v_discount_pct := COALESCE(v_discount_pct, 0);
        END IF;

        DELETE FROM public.payment_details WHERE payment_id = v_payment_id AND delivery_id = v_delivery.delivery_id;

        INSERT INTO public.payment_details (
          payment_id, delivery_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
          moisture_content_pct, moisture_deduction_kg, final_weight_kg,
          price_type, price_per_kg_used, pca_discount_amount, line_amount
        )
        SELECT
          v_payment_id,
          v_delivery.delivery_id,
          alloc_net_kg,
          0,
          alloc_net_kg,
          v_current_mc,
          GREATEST(0, alloc_net_kg - da.allocated_weight_kg),
          da.allocated_weight_kg,
          da.price_type,
          price_used,
          GREATEST(0, alloc_net_kg - da.allocated_weight_kg),
          ROUND(da.allocated_weight_kg * price_used, 2)
        FROM public.delivery_allocations da
        CROSS JOIN LATERAL (
          SELECT CASE WHEN v_discount_pct < 100
            THEN da.allocated_weight_kg / (1 - v_discount_pct / 100.0)
            ELSE da.allocated_weight_kg END AS alloc_net_kg
        ) net_calc
        CROSS JOIN LATERAL (
          SELECT CASE WHEN da.contract_id IS NOT NULL
            THEN (SELECT negotiated_price_per_kg FROM public.contracts WHERE contract_id = da.contract_id)
            ELSE (SELECT price_per_kg FROM public.spot_price ORDER BY updated_at DESC LIMIT 1)
          END AS price_used
        ) price_calc
        WHERE da.delivery_id = v_delivery.delivery_id;

        UPDATE public.payments
        SET total_amount = (SELECT COALESCE(SUM(line_amount), 0) FROM public.payment_details WHERE payment_id = v_payment_id)
        WHERE payment_id = v_payment_id;
      ELSE
        v_payment_note := 'This delivery''s payment is already ' || v_payment_status || '; the financial record was not altered.';
      END IF;
    END IF;
  END IF;

  -- ── Permanent audit trail ───────────────────────────────────────────────
  INSERT INTO public.delivery_corrections (
    issue_report_id, delivery_id, issue_type, old_value, corrected_value,
    submitted_by, resolved_by, date_reported
  ) VALUES (
    p_issue_report_id, v_delivery.delivery_id, v_issue.issue_type, v_old_value, p_corrected_value,
    v_issue.reported_by, auth.uid(), v_issue.created_at
  );

  UPDATE public.delivery_issue_reports
  SET status = 'Resolved', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE issue_report_id = p_issue_report_id;

  v_result_json := jsonb_build_object(
    'old_value', v_old_value,
    'corrected_value', p_corrected_value,
    'payment_note', v_payment_note
  );
  RETURN v_result_json;
END;
$$;


ALTER FUNCTION "public"."apply_delivery_correction"("p_issue_report_id" "uuid", "p_corrected_value" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_final_weight_to_allocations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.result = 'Accepted' THEN
    PERFORM public.recompute_delivery_allocation(NEW.delivery_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."apply_final_weight_to_allocations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_weight_correction"("p_issue_report_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric, "p_num_sacks" integer, "p_condition" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_issue           public.delivery_issue_reports;
  v_delivery        public.deliveries;
  v_weighing_id     UUID;
  v_old_net_kg      NUMERIC;
  v_new_net_kg      NUMERIC;
  v_new_final_kg    NUMERIC;
  v_sacks_deduction NUMERIC := 0;
  v_wet_deduction   NUMERIC := 0;
  v_payment_id      UUID;
  v_payment_status  TEXT;
  v_payment_note    TEXT := NULL;
  v_current_mc      NUMERIC;
  v_rounded_mc      DECIMAL(4,1);
  v_discount_pct    NUMERIC := 0;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can apply a correction' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_issue FROM public.delivery_issue_reports WHERE issue_report_id = p_issue_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue report not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.status = 'Resolved' THEN
    RAISE EXCEPTION 'This issue has already been resolved' USING ERRCODE = '22023';
  END IF;
  IF v_issue.issue_type <> 'Weight Correction' THEN
    RAISE EXCEPTION 'This function only applies to Weight Correction issues' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery FROM public.deliveries WHERE delivery_id = v_issue.delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Delivery date is required' USING ERRCODE = '22023';
  END IF;
  IF p_gross_kg IS NULL OR p_gross_kg <= 0 THEN
    RAISE EXCEPTION 'Gross weight must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT weighing_id, net_weight_kg INTO v_weighing_id, v_old_net_kg
  FROM public.weighing_records
  WHERE delivery_id = v_delivery.delivery_id
  ORDER BY weighed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No weighing record found for this delivery' USING ERRCODE = 'P0002';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  IF v_delivery.delivery_source = 'Contract-based' THEN
    -- Mirrors ContractualDeliveryForm.jsx's validateForm() exactly.
    IF p_tare_kg IS NULL OR p_tare_kg < 0 THEN
      RAISE EXCEPTION 'Tare weight cannot be negative' USING ERRCODE = '22023';
    END IF;
    IF p_tare_kg >= p_gross_kg THEN
      RAISE EXCEPTION 'Tare weight must be less than gross weight' USING ERRCODE = '22023';
    END IF;

    v_new_net_kg := p_gross_kg - p_tare_kg;

    UPDATE public.weighing_records
    SET gross_weight_kg = p_gross_kg,
        tare_weight_kg  = p_tare_kg,
        net_weight_kg   = v_new_net_kg
    WHERE weighing_id = v_weighing_id;

    UPDATE public.deliveries
    SET delivery_date      = p_delivery_date,
        truck_plate_number = NULLIF(TRIM(p_truck_plate), '')
    WHERE delivery_id = v_delivery.delivery_id;

    -- Reuses the existing Final-Weight cascade engine: it reads the
    -- (now-corrected) Net Weight + current MC fresh from the DB, so
    -- correcting the weight recomputes the right split.
    PERFORM public.recompute_delivery_allocation(v_delivery.delivery_id);

    v_new_final_kg := (
      SELECT COALESCE(SUM(allocated_weight_kg), 0)
      FROM public.delivery_allocations
      WHERE delivery_id = v_delivery.delivery_id
    );

    UPDATE public.inventory_batches
    SET weight_kg = v_new_final_kg
    WHERE delivery_id = v_delivery.delivery_id;

  -- ──────────────────────────────────────────────────────────────────────
  ELSE
    -- Walk-in: mirrors WalkinDeliveryForm.jsx's weight computation exactly
    -- (entered weight IS the gross weight; sacks deduction = num_sacks / 2;
    -- wet deduction = 10% of gross when Condition = 'Wet'). There is no
    -- separate lab/PCA step for Walk-in, so the resulting final weight IS
    -- the new net_weight_kg stored on weighing_records.
    IF p_num_sacks IS NULL OR p_num_sacks <= 0 THEN
      RAISE EXCEPTION 'Number of sacks must be greater than zero' USING ERRCODE = '22023';
    END IF;
    IF p_condition IS NULL OR p_condition NOT IN ('Dry', 'Wet') THEN
      RAISE EXCEPTION 'Condition must be Dry or Wet' USING ERRCODE = '22023';
    END IF;

    v_sacks_deduction := p_num_sacks / 2.0;
    v_wet_deduction   := CASE WHEN p_condition = 'Wet' THEN p_gross_kg * 0.10 ELSE 0 END;
    v_new_final_kg    := GREATEST(GREATEST(p_gross_kg - v_sacks_deduction, 0) - v_wet_deduction, 0);
    v_new_net_kg      := v_new_final_kg; -- Walk-in has no separate PCA step: net = final.

    UPDATE public.weighing_records
    SET gross_weight_kg = p_gross_kg,
        tare_weight_kg  = v_sacks_deduction,
        net_weight_kg   = v_new_final_kg,
        copra_condition = p_condition,
        num_sacks       = p_num_sacks
    WHERE weighing_id = v_weighing_id;

    UPDATE public.deliveries
    SET delivery_date      = p_delivery_date,
        walkin_amount_paid = ROUND(v_new_final_kg * walkin_spot_price_kg, 2)
    WHERE delivery_id = v_delivery.delivery_id;

    UPDATE public.inventory_batches
    SET weight_kg = v_new_final_kg
    WHERE delivery_id = v_delivery.delivery_id;
  END IF;

  -- ── Keep a still-Pending payment in sync (money not yet sent) ─────────
  -- Identical logic/comments to apply_delivery_correction() (migration
  -- 20261002000076) — only ever applies to Contract-based deliveries.
  IF v_delivery.delivery_source = 'Contract-based' THEN
    SELECT DISTINCT pd.payment_id INTO v_payment_id
    FROM public.payment_details pd
    WHERE pd.delivery_id = v_delivery.delivery_id
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      SELECT payment_status INTO v_payment_status FROM public.payments WHERE payment_id = v_payment_id FOR UPDATE;

      IF v_payment_status = 'Pending' THEN
        SELECT li.moisture_content_pct INTO v_current_mc
        FROM public.quality_results qr
        JOIN public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
        WHERE qr.delivery_id = v_delivery.delivery_id
        ORDER BY qr.evaluated_at DESC
        LIMIT 1;

        IF v_current_mc < 5.0 THEN
          v_discount_pct := 0;
        ELSE
          v_rounded_mc := ROUND(v_current_mc, 1);
          SELECT discount_value INTO v_discount_pct FROM public.pca_discount_table WHERE moisture_content_pct = v_rounded_mc;
          v_discount_pct := COALESCE(v_discount_pct, 0);
        END IF;

        DELETE FROM public.payment_details WHERE payment_id = v_payment_id AND delivery_id = v_delivery.delivery_id;

        INSERT INTO public.payment_details (
          payment_id, delivery_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
          moisture_content_pct, moisture_deduction_kg, final_weight_kg,
          price_type, price_per_kg_used, pca_discount_amount, line_amount
        )
        SELECT
          v_payment_id,
          v_delivery.delivery_id,
          alloc_net_kg,
          0,
          alloc_net_kg,
          v_current_mc,
          GREATEST(0, alloc_net_kg - da.allocated_weight_kg),
          da.allocated_weight_kg,
          da.price_type,
          price_used,
          GREATEST(0, alloc_net_kg - da.allocated_weight_kg),
          ROUND(da.allocated_weight_kg * price_used, 2)
        FROM public.delivery_allocations da
        CROSS JOIN LATERAL (
          SELECT CASE WHEN v_discount_pct < 100
            THEN da.allocated_weight_kg / (1 - v_discount_pct / 100.0)
            ELSE da.allocated_weight_kg END AS alloc_net_kg
        ) net_calc
        CROSS JOIN LATERAL (
          SELECT CASE WHEN da.contract_id IS NOT NULL
            THEN (SELECT negotiated_price_per_kg FROM public.contracts WHERE contract_id = da.contract_id)
            ELSE (SELECT price_per_kg FROM public.spot_price ORDER BY updated_at DESC LIMIT 1)
          END AS price_used
        ) price_calc
        WHERE da.delivery_id = v_delivery.delivery_id;

        UPDATE public.payments
        SET total_amount = (SELECT COALESCE(SUM(line_amount), 0) FROM public.payment_details WHERE payment_id = v_payment_id)
        WHERE payment_id = v_payment_id;
      ELSE
        v_payment_note := 'This delivery''s payment is already ' || v_payment_status || '; the financial record was not altered.';
      END IF;
    END IF;
  END IF;

  -- ── Permanent audit trail (same table/shape as apply_delivery_correction) ─
  -- Both sides are expressed in Net Weight terms (pre-PCA-deduction for
  -- Contract-based, which IS the final payable weight for Walk-in) so the
  -- comparison is apples-to-apples — never the pre-deduction Net Weight
  -- against the post-deduction allocated Final Weight.
  INSERT INTO public.delivery_corrections (
    issue_report_id, delivery_id, issue_type, old_value, corrected_value,
    submitted_by, resolved_by, date_reported
  ) VALUES (
    p_issue_report_id, v_delivery.delivery_id, v_issue.issue_type, v_old_net_kg, v_new_net_kg,
    v_issue.reported_by, auth.uid(), v_issue.created_at
  );

  UPDATE public.delivery_issue_reports
  SET status = 'Resolved', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE issue_report_id = p_issue_report_id;

  RETURN jsonb_build_object(
    'old_value', v_old_net_kg,
    'corrected_value', v_new_net_kg,
    'payment_note', v_payment_note
  );
END;
$$;


ALTER FUNCTION "public"."apply_weight_correction"("p_issue_report_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric, "p_num_sacks" integer, "p_condition" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_breach_overdue_contracts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_contract    RECORD;
  v_delivered_kg DECIMAL;
BEGIN
  FOR v_contract IN
    SELECT c.contract_id, c.contract_number,
           c.supplier_id, c.business_owner_id,
           c.contracted_tons
    FROM public.contracts c
    WHERE c.status = 'Active'
      AND c.due_date < CURRENT_DATE
  LOOP
    -- Sum all accepted allocation weights for this contract
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO v_delivered_kg
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = v_contract.contract_id
      AND d.delivery_status = 'Accepted';

    -- Only breach if quantity not fully delivered
    IF v_delivered_kg < v_contract.contracted_tons * 1000 THEN
      UPDATE public.contracts
      SET status = 'Breached'
      WHERE contract_id = v_contract.contract_id;
      -- NOTE: compute_supplier_rating() is intentionally NOT called
      -- here anymore — the on_contract_status_change trigger (fired
      -- by the UPDATE above) already computes it exactly once.

      -- Notify supplier
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.supplier_id,
        'Contract Breached',
        'Contract ' || v_contract.contract_number ||
          ' has been marked as Breached because the delivery deadline passed without full fulfillment.',
        'contracts',
        v_contract.contract_id
      );

      -- Notify business owner
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.business_owner_id,
        'Contract Breached',
        'Contract ' || v_contract.contract_number ||
          ' has been automatically marked as Breached. The delivery deadline passed without full fulfillment.',
        'contracts',
        v_contract.contract_id
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."auto_breach_overdue_contracts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_complete_fulfilled_contracts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_contract     RECORD;
  v_delivered_kg DECIMAL;
BEGIN
  FOR v_contract IN
    SELECT c.contract_id, c.contract_number,
           c.supplier_id, c.business_owner_id,
           c.contracted_tons
    FROM public.contracts c
    WHERE c.status = 'Active'
  LOOP
    -- Sum all accepted allocation weights for this contract
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO v_delivered_kg
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = v_contract.contract_id
      AND d.delivery_status = 'Accepted';

    IF v_delivered_kg >= v_contract.contracted_tons * 1000 THEN
      UPDATE public.contracts
      SET status = 'Completed'
      WHERE contract_id = v_contract.contract_id;

      -- Notify supplier
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.supplier_id,
        'Contract Completed',
        'Contract ' || v_contract.contract_number ||
          ' has been fully delivered and marked as Completed.',
        'contracts',
        v_contract.contract_id
      );

      -- Notify business owner
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        v_contract.business_owner_id,
        'Contract Completed',
        'Contract ' || v_contract.contract_number ||
          ' has been fully delivered by the supplier and is now Completed.',
        'contracts',
        v_contract.contract_id
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."auto_complete_fulfilled_contracts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_contract_completion_on_acceptance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_rec              RECORD;
    v_accepted_kg      DECIMAL;
BEGIN
    -- Only fire when a delivery transitions to 'Accepted'
    IF NEW.delivery_status = 'Accepted' AND
       (OLD.delivery_status IS DISTINCT FROM 'Accepted') THEN

        FOR v_rec IN
            SELECT DISTINCT
                c.contract_id,
                c.supplier_id,
                c.business_owner_id,
                c.contract_number,
                c.contracted_tons
            FROM public.delivery_allocations da
            JOIN public.contracts c ON c.contract_id = da.contract_id
            WHERE da.delivery_id = NEW.delivery_id
              AND da.contract_id IS NOT NULL
              AND c.status = 'Active'
        LOOP
            -- Sum all accepted allocation weights for this contract
            SELECT COALESCE(SUM(da2.allocated_weight_kg), 0)
            INTO v_accepted_kg
            FROM public.delivery_allocations da2
            JOIN public.deliveries d2 ON d2.delivery_id = da2.delivery_id
            WHERE da2.contract_id = v_rec.contract_id
              AND d2.delivery_status = 'Accepted';

            IF v_accepted_kg >= v_rec.contracted_tons * 1000 THEN
                UPDATE public.contracts
                SET status = 'Completed'
                WHERE contract_id = v_rec.contract_id;

                -- Notify supplier
                INSERT INTO public.notifications
                    (user_id, notification_type, message, related_entity_type, related_entity_id)
                VALUES (
                    v_rec.supplier_id,
                    'Contract Completed',
                    'Contract ' || v_rec.contract_number ||
                        ' has been fully delivered and marked as Completed.',
                    'contracts',
                    v_rec.contract_id
                );

                -- Notify Business Owner
                INSERT INTO public.notifications
                    (user_id, notification_type, message, related_entity_type, related_entity_id)
                VALUES (
                    v_rec.business_owner_id,
                    'Contract Completed',
                    'Contract ' || v_rec.contract_number ||
                        ' has been fully delivered by the supplier and is now Completed.',
                    'contracts',
                    v_rec.contract_id
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_contract_completion_on_acceptance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_contract_deadlines"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_contract  RECORD;
  days_left   INTEGER;
BEGIN
  FOR v_contract IN
    SELECT c.contract_id, c.contract_number, c.due_date,
           c.supplier_id, c.business_owner_id
    FROM public.contracts c
    WHERE c.status = 'Active'
      AND c.due_date >= CURRENT_DATE
      AND c.due_date <= CURRENT_DATE + INTERVAL '3 days'
  LOOP
    days_left := v_contract.due_date - CURRENT_DATE;

    -- Notify supplier
    INSERT INTO public.notifications
      (user_id, notification_type, message, related_entity_type, related_entity_id)
    VALUES (
      v_contract.supplier_id,
      'Deadline Reminder',
      'Contract ' || v_contract.contract_number || ' is due in ' ||
        CASE days_left
          WHEN 0 THEN 'today'
          WHEN 1 THEN '1 day'
          ELSE days_left || ' days'
        END || ' (' || TO_CHAR(v_contract.due_date, 'Mon DD, YYYY') || '). Ensure all deliveries are completed on time.',
      'contracts',
      v_contract.contract_id
    );

    -- Notify business owner
    INSERT INTO public.notifications
      (user_id, notification_type, message, related_entity_type, related_entity_id)
    VALUES (
      v_contract.business_owner_id,
      'Deadline Reminder',
      'Contract ' || v_contract.contract_number || ' deadline is in ' ||
        CASE days_left
          WHEN 0 THEN 'today'
          WHEN 1 THEN '1 day'
          ELSE days_left || ' days'
        END || ' (' || TO_CHAR(v_contract.due_date, 'Mon DD, YYYY') || ').',
      'contracts',
      v_contract.contract_id
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."check_contract_deadlines"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_merge_eligibility"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  batch    RECORD;
  owner_id UUID;
BEGIN
  -- Find the active Business Owner
  SELECT u.user_id INTO owner_id
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE r.role_name = 'Business Owner'
    AND u.account_status = 'Active'
  LIMIT 1;

  -- ── Step 1: Tomorrow reminder ─────────────────────────────────────────────
  -- For every Walk-in Holding batch that becomes eligible tomorrow,
  -- send a "Merge Tomorrow" notification so the BO knows in advance.
  FOR batch IN
    SELECT *
    FROM public.inventory_batches
    WHERE source_type = 'Walkin'
      AND batch_status = 'Walk-in Holding'
      AND merge_eligible_date IS NOT NULL
      AND merge_eligible_date = CURRENT_DATE + INTERVAL '1 day'
  LOOP
    IF owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        owner_id,
        'Merge Tomorrow',
        batch.weight_kg || ' kg walk-in copra batch will be automatically merged into Resecada tomorrow (' ||
          (CURRENT_DATE + INTERVAL '1 day')::DATE || ').',
        'inventory_batches',
        batch.inventory_batch_id
      );
    END IF;
  END LOOP;

  -- ── Step 2: Auto-merge eligible batches ───────────────────────────────────
  -- Merge any Walk-in Holding (or legacy Ready to Merge) batches that
  -- have reached or passed their merge_eligible_date.
  FOR batch IN
    SELECT *
    FROM public.inventory_batches
    WHERE source_type = 'Walkin'
      AND batch_status IN ('Walk-in Holding', 'Ready to Merge')
      AND merge_eligible_date IS NOT NULL
      AND merge_eligible_date <= CURRENT_DATE
  LOOP
    -- Move to Resecada
    UPDATE public.inventory_batches
    SET
      batch_status    = 'Resecada',
      merged_at       = NOW(),
      review_decision = 'Auto-Merged'
    WHERE inventory_batch_id = batch.inventory_batch_id;

    -- Audit log
    INSERT INTO public.inventory_transactions
      (inventory_batch_id, transaction_type, quantity_kg)
    VALUES (
      batch.inventory_batch_id,
      'Merge to Resecada',
      batch.weight_kg
    );

    -- Notify BO: merge completed
    IF owner_id IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type, related_entity_id)
      VALUES (
        owner_id,
        'Merge Completed',
        batch.weight_kg || ' kg walk-in copra batch has been automatically merged into the Resecada pool.',
        'inventory_batches',
        batch.inventory_batch_id
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."check_merge_eligibility"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  -- Trusted internal/service-role callers have no auth.uid(); never
  -- throttle them (this is the existing AI auto-response/counteroffer path).
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_log
  WHERE user_id = v_uid
    AND action = p_action
    AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded for %, please slow down.', p_action
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_log (user_id, action) VALUES (v_uid, p_action);
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_issue_evidence"("p_issue_report_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_issue public.delivery_issue_reports;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can clear issue evidence' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_issue FROM public.delivery_issue_reports WHERE issue_report_id = p_issue_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue report not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.status <> 'Resolved' THEN
    RAISE EXCEPTION 'Evidence can only be cleared after the issue is Resolved' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.file_uploads
  WHERE file_id IN (v_issue.evidence_photo_1_file_id, v_issue.evidence_photo_2_file_id);

  UPDATE public.delivery_issue_reports
  SET evidence_removed_at = NOW()
  WHERE issue_report_id = p_issue_report_id;
END;
$$;


ALTER FUNCTION "public"."clear_issue_evidence"("p_issue_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_supplier_rating"("p_contract_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Delivered Volume (20%): total allocated kg across accepted deliveries for this contract.
  -- Uses delivery_allocations so that overflow allocations are included.
  -- A Breached contract earns ZERO Delivered Volume credit regardless of how
  -- much was actually delivered before the deadline passed.
  IF v_contract.status = 'Breached' THEN
    v_volume_score := 0.0;
  ELSE
    SELECT COALESCE(SUM(da.allocated_weight_kg), 0) INTO v_total_kg
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = p_contract_id
      AND d.delivery_status = 'Accepted';

    v_volume_score := CASE
      WHEN v_total_kg >= 50000 THEN 100.0  -- ≥50 tons
      WHEN v_total_kg >= 40000 THEN  80.0
      WHEN v_total_kg >= 30000 THEN  60.0
      WHEN v_total_kg >= 20000 THEN  40.0
      ELSE                           20.0  -- <20 tons
    END;
  END IF;

  -- Copra Quality (20%): average moisture content (cc) across accepted deliveries
  -- allocated to this contract. Independent of Breached/Completed status — a
  -- Breached contract still gets full credit for good copra quality.
  SELECT COALESCE(AVG(li.moisture_content_pct), 0) INTO v_avg_moisture
  FROM public.delivery_allocations da
  JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  JOIN public.laboratory_inspections li ON li.delivery_id = da.delivery_id
  WHERE da.contract_id = p_contract_id
    AND d.delivery_status = 'Accepted';

  v_quality_score := CASE
    WHEN v_avg_moisture  > 20.2 THEN   0.0  -- Rejected
    WHEN v_avg_moisture >= 10.5 THEN  20.0
    WHEN v_avg_moisture >=  9.5 THEN  40.0
    WHEN v_avg_moisture >=  8.5 THEN  60.0
    WHEN v_avg_moisture >=  7.5 THEN  80.0
    ELSE                              100.0  -- 5.0–7.4 cc
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

  -- Overall rating = weighted average across all per-contract snapshots for this supplier
  SELECT ROUND(AVG(sps.supplier_rating), 2) INTO v_overall
  FROM public.supplier_performance_snapshot sps
  WHERE sps.supplier_id = v_contract.supplier_id;

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


ALTER FUNCTION "public"."compute_supplier_rating"("p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contract_allocation_detail"("p_contract_id" "uuid") RETURNS TABLE("allocation_id" "uuid", "delivery_id" "uuid", "delivery_date" "date", "delivery_status" "public"."delivery_status_enum", "allocated_weight_kg" numeric, "price_type" "public"."price_type_enum", "sequence_order" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT da.allocation_id, da.delivery_id, d.delivery_date, d.delivery_status,
         da.allocated_weight_kg, da.price_type, da.sequence_order
  FROM public.delivery_allocations da
  JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  WHERE da.contract_id = p_contract_id
  ORDER BY d.delivery_date ASC, da.sequence_order ASC;
$$;


ALTER FUNCTION "public"."contract_allocation_detail"("p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contract_allocation_reconciliation"() RETURNS TABLE("contract_id" "uuid", "contract_number" character varying, "supplier_name" "text", "contract_status" "public"."contract_status_enum", "contracted_kg" numeric, "allocated_kg" numeric, "excess_kg" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    c.contract_id,
    c.contract_number,
    u.first_name || ' ' || u.last_name AS supplier_name,
    c.status,
    (c.contracted_tons * 1000)::DECIMAL(12,3) AS contracted_kg,
    COALESCE(SUM(da.allocated_weight_kg) FILTER (WHERE d.delivery_status <> 'Rejected'), 0)::DECIMAL(12,3) AS allocated_kg,
    GREATEST(
      0,
      COALESCE(SUM(da.allocated_weight_kg) FILTER (WHERE d.delivery_status <> 'Rejected'), 0)
        - (c.contracted_tons * 1000)
    )::DECIMAL(12,3) AS excess_kg
  FROM public.contracts c
  JOIN public.users u ON u.user_id = c.supplier_id
  LEFT JOIN public.delivery_allocations da ON da.contract_id = c.contract_id
  LEFT JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  GROUP BY c.contract_id, c.contract_number, u.first_name, u.last_name, c.status, c.contracted_tons
  ORDER BY excess_kg DESC, c.created_at DESC;
$$;


ALTER FUNCTION "public"."contract_allocation_reconciliation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_payment_batch"("p_supplier_id" "uuid", "p_business_owner_id" "uuid", "p_payment_week" "date", "p_total_amount" numeric, "p_notification_msg" "text", "p_details" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_payment_id UUID;
BEGIN
  -- Guard: if ALL deliveries referenced in p_details already have a payment_id,
  -- there is nothing to do (idempotency / double-click protection).
  IF NOT EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE d.delivery_id IN (
      SELECT (elem->>'delivery_id')::UUID
      FROM jsonb_array_elements(p_details) AS elem
    )
    AND d.payment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'All deliveries in this batch have already been assigned a payment. No changes made.';
  END IF;

  -- 1. Payment header
  INSERT INTO public.payments (
    supplier_id, business_owner_id, payment_week,
    total_amount, payment_status, payment_method
  ) VALUES (
    p_supplier_id, p_business_owner_id, p_payment_week,
    p_total_amount, 'Pending', 'Bank Transfer'
  ) RETURNING payment_id INTO v_payment_id;

  -- 2. Payment detail lines (explicit enum cast for price_type)
  INSERT INTO public.payment_details (
    payment_id, delivery_id,
    gross_weight_kg, tare_weight_kg, net_weight_kg,
    moisture_content_pct, moisture_deduction_kg,
    final_weight_kg, price_type, price_per_kg_used,
    pca_discount_amount, line_amount
  )
  SELECT
    v_payment_id,
    (elem->>'delivery_id')::UUID,
    (elem->>'gross_weight_kg')::NUMERIC,
    (elem->>'tare_weight_kg')::NUMERIC,
    (elem->>'net_weight_kg')::NUMERIC,
    (elem->>'moisture_content_pct')::NUMERIC,
    (elem->>'moisture_deduction_kg')::NUMERIC,
    (elem->>'final_weight_kg')::NUMERIC,
    (elem->>'price_type')::public.price_type_enum,
    (elem->>'price_per_kg_used')::NUMERIC,
    (elem->>'pca_discount_amount')::NUMERIC,
    (elem->>'line_amount')::NUMERIC
  FROM jsonb_array_elements(p_details) AS elem;

  -- 3. Stamp payment_id on every delivery in this batch
  --    (only deliveries that are still unassigned to avoid overwriting)
  UPDATE public.deliveries
  SET payment_id = v_payment_id
  WHERE delivery_id IN (
    SELECT DISTINCT (elem->>'delivery_id')::UUID
    FROM jsonb_array_elements(p_details) AS elem
  )
  AND payment_id IS NULL;

  -- 4. Notify supplier
  INSERT INTO public.notifications (
    user_id, message, notification_type,
    related_entity_type, related_entity_id
  ) VALUES (
    p_supplier_id, p_notification_msg, 'Weekly Payment Ready',
    'payments', v_payment_id
  );

  RETURN v_payment_id;
END;
$$;


ALTER FUNCTION "public"."create_payment_batch"("p_supplier_id" "uuid", "p_business_owner_id" "uuid", "p_payment_week" "date", "p_total_amount" numeric, "p_notification_msg" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_payment_receipt"("p_payment_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_receipt_number TEXT;
BEGIN
  SELECT receipt_number
    INTO v_receipt_number
    FROM public.e_receipts
   WHERE payment_id = p_payment_id;

  IF v_receipt_number IS NOT NULL THEN
    RETURN v_receipt_number;
  END IF;

  v_receipt_number :=
    'RCP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.e_receipt_number_seq')::TEXT, 4, '0');

  INSERT INTO public.e_receipts (payment_id, receipt_number)
  VALUES (p_payment_id, v_receipt_number)
  ON CONFLICT (payment_id) DO NOTHING;

  SELECT receipt_number
    INTO v_receipt_number
    FROM public.e_receipts
   WHERE payment_id = p_payment_id;

  RETURN v_receipt_number;
END;
$$;


ALTER FUNCTION "public"."create_payment_receipt"("p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_current_proposal"("p_proposal_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_proposal public.proposal_forms%ROWTYPE;
  v_conv public.conversations%ROWTYPE;
  v_submitter UUID;
BEGIN
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_proposal.conversation_id::text));
  SELECT * INTO v_proposal FROM public.proposal_forms WHERE proposal_id = p_proposal_id;
  SELECT * INTO v_conv FROM public.conversations WHERE conversation_id = v_proposal.conversation_id;
  IF auth.uid() IS NULL OR auth.uid() NOT IN (v_conv.supplier_id, v_conv.business_owner_id) THEN
    RAISE EXCEPTION 'You can only decline proposals for your own conversations.' USING ERRCODE = '42501';
  END IF;
  v_submitter := v_proposal.submitted_by;
  IF v_submitter IS NULL THEN
    SELECT CASE WHEN count(*) % 2 = 0 THEN v_conv.supplier_id ELSE v_conv.business_owner_id END
      INTO v_submitter FROM public.proposal_forms
     WHERE conversation_id = v_conv.conversation_id
       AND (submitted_at, proposal_id) < (v_proposal.submitted_at, v_proposal.proposal_id);
  END IF;
  IF v_submitter = auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can decline this offer.' USING ERRCODE = '42501';
  END IF;
  IF v_proposal.proposal_status <> 'Pending' OR v_conv.status = 'Terminated' THEN
    RAISE EXCEPTION 'This offer is no longer Pending. Refresh the conversation.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.proposal_forms
     SET proposal_status = 'Rejected',
         reviewed_by = CASE WHEN auth.uid() = v_conv.business_owner_id THEN auth.uid() ELSE reviewed_by END
   WHERE proposal_id = p_proposal_id;
  UPDATE public.conversations SET status = 'Terminated' WHERE conversation_id = v_conv.conversation_id;
END;
$$;


ALTER FUNCTION "public"."decline_current_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_active_contract_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status <> 'Active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'Active' AND OLD.supplier_id = NEW.supplier_id THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier-contracts:' || NEW.supplier_id, 0));
  IF (SELECT count(*) FROM public.contracts
      WHERE supplier_id = NEW.supplier_id AND status = 'Active'
        AND contract_id <> NEW.contract_id) >= 3 THEN
    RAISE EXCEPTION 'Supplier may have a maximum of 3 Active contracts.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_active_contract_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_delivery_allocation_cap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_contracted_kg   DECIMAL(12,3);
  v_existing_kg     DECIMAL(12,3);
  v_delivery_status public.delivery_status_enum;
BEGIN
  -- NULL contract_id = the uncapped Spot-price overflow portion of a
  -- delivery; never subject to a contract's agreed-quantity cap.
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT delivery_status INTO v_delivery_status
  FROM public.deliveries WHERE delivery_id = NEW.delivery_id;

  -- A Rejected delivery's allocation never counts against contract capacity
  -- (matches the existing convention used throughout the app/RPC).
  IF v_delivery_status = 'Rejected' THEN
    RETURN NEW;
  END IF;

  SELECT (contracted_tons * 1000)::DECIMAL(12,3) INTO v_contracted_kg
  FROM public.contracts WHERE contract_id = NEW.contract_id;

  -- Sum every OTHER non-Rejected allocation already committed to this
  -- contract (excluding this exact row, relevant for UPDATE).
  SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
  INTO v_existing_kg
  FROM public.delivery_allocations da
  JOIN public.deliveries d ON d.delivery_id = da.delivery_id
  WHERE da.contract_id = NEW.contract_id
    AND d.delivery_status <> 'Rejected'
    AND da.allocation_id IS DISTINCT FROM NEW.allocation_id;

  IF v_existing_kg + NEW.allocated_weight_kg > v_contracted_kg + 0.01 THEN
    RAISE EXCEPTION
      'Allocation of % kg to contract % would exceed its agreed quantity of % kg (already allocated: % kg). Over-allocation is not permitted.',
      NEW.allocated_weight_kg, NEW.contract_id, v_contracted_kg, v_existing_kg
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_delivery_allocation_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_messages_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.check_rate_limit('messages_insert', 30, 10);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_messages_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_proposals_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.check_rate_limit('proposal_forms_insert', 10, 30);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_proposals_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_negotiation"("p_proposal_id" "uuid") RETURNS TABLE("final_conversation_id" "uuid", "final_proposal_id" "uuid", "final_price_per_kg" numeric, "final_volume_tons" numeric, "final_supplier_id" "uuid", "final_business_owner_id" "uuid", "finalized_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  proposal_row public.proposal_forms%ROWTYPE;
  conversation_row public.conversations%ROWTYPE;
  actor_id UUID := auth.uid();
  finalized_time TIMESTAMPTZ := NOW();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO proposal_row
  FROM public.proposal_forms
  WHERE proposal_id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR proposal_row.proposal_status <> 'Pending' THEN
    RETURN;
  END IF;

  SELECT * INTO conversation_row
  FROM public.conversations
  WHERE conversation_id = proposal_row.conversation_id
  FOR UPDATE;

  IF NOT FOUND
     OR actor_id NOT IN (conversation_row.supplier_id, conversation_row.business_owner_id)
     OR proposal_row.submitted_by = actor_id
     OR conversation_row.negotiation_finalized_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.proposal_forms
  SET proposal_status = 'Accepted', reviewed_by = actor_id
  WHERE proposal_id = proposal_row.proposal_id;

  UPDATE public.proposal_forms
  SET proposal_status = 'Modified', reviewed_by = actor_id
  WHERE conversation_id = proposal_row.conversation_id
    AND proposal_id <> proposal_row.proposal_id
    AND proposal_status = 'Pending';

  UPDATE public.conversations
  SET
    accepted_proposal_id = proposal_row.proposal_id,
    agreed_price_per_kg = proposal_row.proposed_price_per_kg,
    agreed_volume_tons = proposal_row.proposed_volume_tons,
    negotiation_finalized_at = finalized_time
  WHERE conversation_id = proposal_row.conversation_id;

  RETURN QUERY SELECT
    proposal_row.conversation_id,
    proposal_row.proposal_id,
    proposal_row.proposed_price_per_kg,
    proposal_row.proposed_volume_tons,
    conversation_row.supplier_id,
    conversation_row.business_owner_id,
    finalized_time;
END;
$$;


ALTER FUNCTION "public"."finalize_negotiation"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_successful_payment"("p_payment_id" "uuid", "p_reference_number" "text") RETURNS TABLE("receipt_number" "text", "finalized" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status public.payments.payment_status%TYPE;
  v_receipt_number TEXT;
BEGIN
  SELECT payment_status
    INTO v_status
    FROM public.payments
   WHERE payment_id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_status = 'Released' THEN
    SELECT er.receipt_number
      INTO v_receipt_number
      FROM public.e_receipts er
     WHERE er.payment_id = p_payment_id;
    RETURN QUERY SELECT v_receipt_number, false;
    RETURN;
  END IF;

  IF v_status <> 'Processing' THEN
    RETURN QUERY SELECT NULL::TEXT, false;
    RETURN;
  END IF;

  v_receipt_number := public.create_payment_receipt(p_payment_id);

  UPDATE public.payments
     SET payment_status = 'Released',
         reference_number = p_reference_number,
         payment_date = CURRENT_DATE
   WHERE payment_id = p_payment_id;

  RETURN QUERY SELECT v_receipt_number, true;
END;
$$;


ALTER FUNCTION "public"."finalize_successful_payment"("p_payment_id" "uuid", "p_reference_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_auth_user_by_email"("p_email" "text") RETURNS TABLE("user_id" "uuid", "auth_email" "text", "banned_until" timestamp with time zone, "raw_user_meta_data" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT id, email, banned_until, raw_user_meta_data
  FROM auth.users
  WHERE email = LOWER(p_email)
  LIMIT 1;
$$;


ALTER FUNCTION "public"."find_auth_user_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_contract_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_contract_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT r.role_name
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE u.user_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_current_proposal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_latest UUID;
  v_parent_status public.proposal_status_enum;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.supersedes_proposal_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('supplier-contracts:' || NEW.supplier_id, 0));
      IF (SELECT count(*) FROM public.contracts
          WHERE supplier_id = NEW.supplier_id AND status = 'Active') >= 3 THEN
        RAISE EXCEPTION 'Supplier may have a maximum of 3 Active contracts.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(NEW.conversation_id::text));
    IF NEW.supersedes_proposal_id IS NOT NULL THEN
      SELECT proposal_id INTO v_latest FROM public.proposal_forms
       WHERE conversation_id = NEW.conversation_id
       ORDER BY submitted_at DESC, proposal_id DESC LIMIT 1;
      SELECT proposal_status INTO v_parent_status FROM public.proposal_forms
       WHERE proposal_id = NEW.supersedes_proposal_id AND conversation_id = NEW.conversation_id;
      IF v_latest IS DISTINCT FROM NEW.supersedes_proposal_id
         OR v_parent_status IS NULL OR v_parent_status NOT IN ('Pending', 'Modified') THEN
        RAISE EXCEPTION 'This offer is no longer the current proposal. Refresh the conversation.'
          USING ERRCODE = '22023';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.proposal_status IS NOT DISTINCT FROM OLD.proposal_status
     OR NEW.proposal_status NOT IN ('Accepted', 'Rejected') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(OLD.conversation_id::text));
  SELECT proposal_id INTO v_latest FROM public.proposal_forms
   WHERE conversation_id = OLD.conversation_id
   ORDER BY submitted_at DESC, proposal_id DESC LIMIT 1;
  IF OLD.proposal_status <> 'Pending' OR v_latest IS DISTINCT FROM OLD.proposal_id THEN
    RAISE EXCEPTION 'This offer is no longer the current Pending proposal. Refresh the conversation.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_current_proposal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_first_time_supplier_proposal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."guard_first_time_supplier_proposal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_contract_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status IN ('Completed', 'Breached') AND OLD.status NOT IN ('Completed', 'Breached') THEN
    PERFORM public.compute_supplier_rating(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_contract_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_walkin_batch_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."handle_walkin_batch_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lab_staff_contract_visible"("p_contract_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_allocations da
    JOIN public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE da.contract_id = p_contract_id
      AND (
        d.delivery_status = 'Weighed'
        OR EXISTS (
          SELECT 1 FROM public.laboratory_inspections li
          WHERE li.delivery_id = d.delivery_id AND li.lab_staff_id = auth.uid()
        )
      )
  );
$$;


ALTER FUNCTION "public"."lab_staff_contract_visible"("p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_contract_activated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.activation_date IS NOT NULL
     AND (OLD.activation_date IS NULL OR NEW.activation_date <> OLD.activation_date)
  THEN
    NEW.due_date := NEW.activation_date + INTERVAL '1 month 1 day';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."on_contract_activated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_signature_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'contract_signatures rows are immutable (signature_id = %)', OLD.signature_id;
END;
$$;


ALTER FUNCTION "public"."prevent_signature_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_contract_chat"("p_contract_id" "uuid", "p_conversation_id" "uuid", "p_is_ai_generated" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_message_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('contract-chat:' || p_contract_id, 0));
  SELECT * INTO v_contract FROM public.contracts WHERE contract_id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
     WHERE conversation_id = p_conversation_id
       AND supplier_id = v_contract.supplier_id
       AND business_owner_id = v_contract.business_owner_id
  ) THEN
    RAISE EXCEPTION 'Contract participants do not match this conversation.' USING ERRCODE = '42501';
  END IF;
  IF v_contract.contract_document_url IS NULL OR v_contract.contract_hash IS NULL THEN
    RAISE EXCEPTION 'Contract document is not ready.' USING ERRCODE = '22023';
  END IF;

  SELECT message_id INTO v_message_id FROM public.messages
   WHERE conversation_id = p_conversation_id
     AND message_type = 'Contract Form'
     AND message_text LIKE 'CONTRACT_CARD:%'
     AND substring(message_text FROM '"contract_id"\s*:\s*"([^"]+)"') = p_contract_id::text
   ORDER BY sent_at, message_id LIMIT 1;
  IF FOUND THEN RETURN v_message_id; END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, message_type, is_ai_generated, message_text
  ) VALUES (
    p_conversation_id, v_contract.business_owner_id, 'Contract Form', p_is_ai_generated,
    'CONTRACT_CARD:' || jsonb_build_object(
      'contract_id', v_contract.contract_id,
      'contract_number', v_contract.contract_number,
      'price_per_kg', v_contract.negotiated_price_per_kg,
      'contracted_tons', v_contract.contracted_tons,
      'due_date', v_contract.due_date,
      'document_path', v_contract.contract_document_url
    )::text
  ) RETURNING message_id INTO v_message_id;
  INSERT INTO public.messages (
    conversation_id, sender_id, message_type, is_ai_generated, message_text
  ) VALUES (
    p_conversation_id, v_contract.business_owner_id, 'Text', p_is_ai_generated,
    CASE WHEN p_is_ai_generated THEN
      'Your price proposal has been accepted. The contract has been generated — please review and sign when you''re ready.'
    ELSE
      'The contract has been generated. Please review and sign when you''re ready.'
    END
  );
  RETURN v_message_id;
END;
$$;


ALTER FUNCTION "public"."publish_contract_chat"("p_contract_id" "uuid", "p_conversation_id" "uuid", "p_is_ai_generated" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_delivery_allocation"("p_delivery_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result             public.quality_result_enum;
  v_mc                 DECIMAL(5,2);
  v_rounded_mc         DECIMAL(4,1);
  v_discount_pct       DECIMAL(5,2) := 0;
  v_net_kg             DECIMAL(12,3);
  v_final_kg           DECIMAL(12,3);
  v_remaining          DECIMAL(12,3);
  v_seq                INTEGER := 1;
  v_primary            UUID;
  v_orig_contract_ids  UUID[];
  v_contract_id        UUID;
  v_contracted_kg      DECIMAL(12,3);
  v_allocated_kg       DECIMAL(12,3);
  v_available_kg       DECIMAL(12,3);
  v_to_alloc           DECIMAL(12,3);
  v_spot_price         DECIMAL(12,4);
BEGIN
  SELECT qr.result, li.moisture_content_pct
  INTO   v_result, v_mc
  FROM   public.quality_results qr
  JOIN   public.laboratory_inspections li ON li.inspection_id = qr.inspection_id
  WHERE  qr.delivery_id = p_delivery_id
  ORDER  BY qr.evaluated_at DESC
  LIMIT  1;

  IF v_result IS DISTINCT FROM 'Accepted' THEN
    RETURN;
  END IF;

  SELECT wr.net_weight_kg INTO v_net_kg
  FROM public.weighing_records wr
  WHERE wr.delivery_id = p_delivery_id
  ORDER BY wr.weighed_at DESC
  LIMIT 1;

  IF v_mc IS NULL OR v_net_kg IS NULL OR v_net_kg <= 0 THEN
    RETURN;
  END IF;

  IF v_mc <= 5.0 THEN
    v_discount_pct := 0;
  ELSE
    v_rounded_mc := ROUND(v_mc, 1);
    SELECT discount_value INTO v_discount_pct
    FROM public.pca_discount_table
    WHERE moisture_content_pct = v_rounded_mc;
    v_discount_pct := COALESCE(v_discount_pct, 0);
  END IF;

  v_final_kg := GREATEST(0, v_net_kg * (1 - v_discount_pct / 100.0));

  SELECT array_agg(contract_id ORDER BY sequence_order)
  INTO   v_orig_contract_ids
  FROM   public.delivery_allocations
  WHERE  delivery_id = p_delivery_id
    AND  contract_id IS NOT NULL;

  -- Preserve the delivery-time Spot price (set by record_contractual_
  -- delivery) rather than re-fetching today's spot price on recompute.
  SELECT spot_price_per_kg_at_delivery INTO v_spot_price
  FROM   public.delivery_allocations
  WHERE  delivery_id = p_delivery_id AND price_type = 'Spot'
  ORDER  BY sequence_order LIMIT 1;

  IF v_spot_price IS NULL THEN
    -- Legacy delivery predating this column — no historical price was
    -- ever captured for it, so there is nothing to preserve.
    SELECT price_per_kg INTO v_spot_price FROM public.spot_price LIMIT 1;
    v_spot_price := COALESCE(v_spot_price, 0);
  END IF;

  DELETE FROM public.delivery_allocations WHERE delivery_id = p_delivery_id;

  v_remaining := v_final_kg;
  v_primary   := NULL;

  IF v_orig_contract_ids IS NOT NULL THEN
    FOREACH v_contract_id IN ARRAY v_orig_contract_ids LOOP
      EXIT WHEN v_remaining <= 0.001;

      SELECT (contracted_tons * 1000)::DECIMAL(12,3) INTO v_contracted_kg
      FROM   public.contracts
      WHERE  contract_id = v_contract_id AND status = 'Active'
      FOR UPDATE;

      CONTINUE WHEN NOT FOUND;

      SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
      INTO   v_allocated_kg
      FROM   public.delivery_allocations da
      JOIN   public.deliveries d ON d.delivery_id = da.delivery_id
      WHERE  da.contract_id = v_contract_id
        AND  d.delivery_status <> 'Rejected';

      v_available_kg := GREATEST(0, v_contracted_kg - v_allocated_kg);
      CONTINUE WHEN v_available_kg <= 0.001;

      v_to_alloc := LEAST(v_available_kg, v_remaining);
      IF v_primary IS NULL THEN
        v_primary := v_contract_id;
      END IF;

      INSERT INTO public.delivery_allocations
        (delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order)
      VALUES
        (p_delivery_id, v_contract_id, v_to_alloc, 'Negotiated', v_seq);

      v_remaining := v_remaining - v_to_alloc;
      v_seq       := v_seq + 1;
    END LOOP;
  END IF;

  IF v_remaining > 0.001 THEN
    INSERT INTO public.delivery_allocations
      (delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order,
       spot_price_per_kg_at_delivery)
    VALUES
      (p_delivery_id, NULL, v_remaining, 'Spot', v_seq, v_spot_price);
  END IF;

  UPDATE public.deliveries
  SET    contract_id = v_primary
  WHERE  delivery_id = p_delivery_id;
END;
$$;


ALTER FUNCTION "public"."recompute_delivery_allocation"("p_delivery_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "audit_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" character varying(50),
    "entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_audit_log"("p_action" "text", "p_entity_type" character varying, "p_entity_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."audit_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."record_audit_log"("p_action" "text", "p_entity_type" character varying, "p_entity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_contractual_delivery"("p_supplier_id" "uuid", "p_weigher_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_net_kg            DECIMAL(12,3);
  v_delivery_id       UUID;
  v_primary_contract  UUID;
  v_spot_price        DECIMAL(12,4);
  v_remaining         DECIMAL(12,3);
  v_seq               INTEGER := 1;
  v_alloc_rows        JSONB   := '[]'::JSONB;

  v_contract          RECORD;
  v_contracted_kg     DECIMAL(12,3);
  v_allocated_kg      DECIMAL(12,3);
  v_available_kg      DECIMAL(12,3);
  v_to_alloc          DECIMAL(12,3);
BEGIN
  IF p_gross_kg <= 0 THEN
    RETURN jsonb_build_object('error', 'Gross weight must be greater than zero.');
  END IF;
  IF p_tare_kg < 0 THEN
    RETURN jsonb_build_object('error', 'Tare weight cannot be negative.');
  END IF;
  IF p_tare_kg >= p_gross_kg THEN
    RETURN jsonb_build_object('error', 'Tare weight must be less than gross weight.');
  END IF;

  v_net_kg := p_gross_kg - p_tare_kg;

  SELECT price_per_kg INTO v_spot_price FROM public.spot_price LIMIT 1;
  v_spot_price := COALESCE(v_spot_price, 0);

  INSERT INTO public.deliveries (
    delivery_source, supplier_id, delivery_date,
    truck_plate_number, weigher_id, delivery_status, contract_id
  ) VALUES (
    'Contract-based', p_supplier_id, p_delivery_date,
    NULLIF(TRIM(p_truck_plate), ''), p_weigher_id, 'Weighed', NULL
  )
  RETURNING delivery_id INTO v_delivery_id;

  INSERT INTO public.weighing_records (
    delivery_id, weigher_id, gross_weight_kg, tare_weight_kg, net_weight_kg
  ) VALUES (
    v_delivery_id, p_weigher_id, p_gross_kg, p_tare_kg, v_net_kg
  );

  v_remaining := v_net_kg;

  FOR v_contract IN
    SELECT c.contract_id, c.contract_number, c.negotiated_price_per_kg, c.due_date,
           (c.contracted_tons * 1000)::DECIMAL(12,3) AS contracted_kg
    FROM   public.contracts c
    WHERE  c.supplier_id = p_supplier_id
      AND  c.status = 'Active'
    ORDER  BY c.due_date ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.001;

    SELECT COALESCE(SUM(da.allocated_weight_kg), 0)
    INTO   v_allocated_kg
    FROM   public.delivery_allocations da
    JOIN   public.deliveries d ON d.delivery_id = da.delivery_id
    WHERE  da.contract_id = v_contract.contract_id
      AND  d.delivery_status <> 'Rejected';

    v_available_kg := GREATEST(0, v_contract.contracted_kg - v_allocated_kg);

    CONTINUE WHEN v_available_kg <= 0.001;

    v_to_alloc := LEAST(v_available_kg, v_remaining);

    IF v_primary_contract IS NULL THEN
      v_primary_contract := v_contract.contract_id;
    END IF;

    INSERT INTO public.delivery_allocations (
      delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order
    ) VALUES (
      v_delivery_id, v_contract.contract_id, v_to_alloc, 'Negotiated', v_seq
    );

    v_alloc_rows := v_alloc_rows || jsonb_build_object(
      'contract_id',          v_contract.contract_id,
      'contract_number',      v_contract.contract_number,
      'allocated_weight_kg',  v_to_alloc,
      'price_type',           'Negotiated',
      'price_per_kg',         v_contract.negotiated_price_per_kg,
      'sequence_order',       v_seq
    );

    v_remaining := v_remaining - v_to_alloc;
    v_seq       := v_seq + 1;
  END LOOP;

  IF v_remaining > 0.001 THEN
    INSERT INTO public.delivery_allocations (
      delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order,
      spot_price_per_kg_at_delivery
    ) VALUES (
      v_delivery_id, NULL, v_remaining, 'Spot', v_seq, v_spot_price
    );

    v_alloc_rows := v_alloc_rows || jsonb_build_object(
      'contract_id',         NULL,
      'contract_number',     NULL,
      'allocated_weight_kg', v_remaining,
      'price_type',          'Spot',
      'price_per_kg',        v_spot_price,
      'sequence_order',      v_seq
    );
  END IF;

  IF v_primary_contract IS NOT NULL THEN
    UPDATE public.deliveries
    SET    contract_id = v_primary_contract
    WHERE  delivery_id = v_delivery_id;
  END IF;

  RETURN jsonb_build_object(
    'delivery_id',  v_delivery_id,
    'net_kg',       v_net_kg,
    'allocations',  v_alloc_rows
  );
END;
$$;


ALTER FUNCTION "public"."record_contractual_delivery"("p_supplier_id" "uuid", "p_weigher_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."copra_sales" (
    "copra_sale_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date_sold" "date" NOT NULL,
    "net_weight_kg" numeric(12,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "copra_sales_net_weight_kg_check" CHECK (("net_weight_kg" > (0)::numeric))
);


ALTER TABLE "public"."copra_sales" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_copra_sale"("p_date_sold" "date", "p_net_weight_kg" numeric) RETURNS "public"."copra_sales"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bodega_stock_kg NUMERIC;
  v_total_sold_kg NUMERIC;
  v_available_kg NUMERIC;
  inserted_row public.copra_sales;
BEGIN
  IF public.get_my_role() <> 'Business Owner' THEN
    RAISE EXCEPTION 'Only the Business Owner can record copra sales'
      USING ERRCODE = '42501';
  END IF;

  IF p_date_sold IS NULL THEN
    RAISE EXCEPTION 'Date sold is required' USING ERRCODE = '22023';
  END IF;

  IF p_net_weight_kg IS NULL OR p_net_weight_kg <= 0 THEN
    RAISE EXCEPTION 'Net weight sold must be greater than zero' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent calls so the check below and the INSERT can never
  -- race against another in-flight record_copra_sale() call.
  PERFORM pg_advisory_xact_lock(hashtext('copra_sales'));

  SELECT COALESCE(SUM(wr.net_weight_kg), 0)
    INTO v_bodega_stock_kg
  FROM public.inventory_batches ib
  JOIN public.weighing_records wr ON wr.delivery_id = ib.delivery_id
  WHERE ib.batch_status = 'Resecada';

  SELECT COALESCE(SUM(net_weight_kg), 0)
    INTO v_total_sold_kg
  FROM public.copra_sales;

  v_available_kg := v_bodega_stock_kg - v_total_sold_kg;

  IF p_net_weight_kg > v_available_kg THEN
    RAISE EXCEPTION 'Sale weight (% kg) exceeds available Bodega Stock (% kg)', p_net_weight_kg, v_available_kg
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.copra_sales (date_sold, net_weight_kg, created_by)
  VALUES (p_date_sold, p_net_weight_kg, auth.uid())
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;


ALTER FUNCTION "public"."record_copra_sale"("p_date_sold" "date", "p_net_weight_kg" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_owner_assistance"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owner_id UUID;
  v_supplier_name TEXT;
BEGIN
  SELECT c.business_owner_id, trim(concat_ws(' ', u.first_name, u.last_name))
    INTO v_owner_id, v_supplier_name
    FROM public.conversations c
    JOIN public.users u ON u.user_id = c.supplier_id
   WHERE c.conversation_id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('owner-assistance:' || p_conversation_id, 0));
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_owner_id
       AND notification_type = 'Supplier Assistance Requested'
       AND related_entity_type = 'conversations'
       AND related_entity_id = p_conversation_id
       AND is_read = false
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.notifications (
    user_id, notification_type, message, related_entity_type, related_entity_id, is_read
  ) VALUES (
    v_owner_id, 'Supplier Assistance Requested',
    coalesce(nullif(v_supplier_name, ''), 'A supplier') || ' would like to speak with you.',
    'conversations', p_conversation_id, false
  );
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."request_owner_assistance"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_proposal_conversation_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status public.conversation_status_enum;
BEGIN
  -- guard_current_proposal acquires the supplier/conversation locks first.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.conversation_id::text));
  SELECT status INTO v_status FROM public.conversations
   WHERE conversation_id = NEW.conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF NEW.supersedes_proposal_id IS NULL THEN
    UPDATE public.conversations SET status = 'Open'
     WHERE conversation_id = NEW.conversation_id AND status = 'Terminated';
  ELSIF v_status <> 'Open' THEN
    RAISE EXCEPTION 'This negotiation is no longer Open. Start a new proposal instead.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_proposal_conversation_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_ai_negotiate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net'
    AS $$
DECLARE
  v_ai_enabled     TEXT;
  v_bo_id          UUID;
  v_fn_url         TEXT;
  v_anon_key       TEXT;
  v_internal_secret TEXT;
BEGIN
  IF NEW.proposal_status <> 'Pending' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_ai_enabled
    FROM public.app_config
   WHERE key = 'ai_auto_negotiate_global';

  IF v_ai_enabled IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;

  SELECT business_owner_id INTO v_bo_id
    FROM public.conversations
   WHERE conversation_id = NEW.conversation_id;

  IF NEW.submitted_by = v_bo_id THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_fn_url
    FROM public.app_config
   WHERE key = 'ai_negotiate_url';
  SELECT value INTO v_anon_key
    FROM public.app_config
   WHERE key = 'supabase_anon_key';
  SELECT value INTO v_internal_secret
    FROM public.app_config
   WHERE key = 'ai_internal_secret';

  IF v_fn_url IS NULL OR v_anon_key IS NULL OR v_internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_fn_url,
    body    := json_build_object('proposal_id', NEW.proposal_id)::jsonb,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-CopTrax-Internal-Secret', v_internal_secret
    )::jsonb
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_ai_negotiate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_auto_release_payments"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net'
    AS $$
DECLARE
  v_fn_url      TEXT;
  v_anon_key    TEXT;
  v_cron_secret TEXT;
BEGIN
  SELECT value INTO v_fn_url
    FROM public.app_config
   WHERE key = 'auto_release_payments_url';
  SELECT value INTO v_anon_key
    FROM public.app_config
   WHERE key = 'supabase_anon_key';
  SELECT value INTO v_cron_secret
    FROM public.app_config
   WHERE key = 'payment_cron_secret';

  IF v_fn_url IS NULL OR v_anon_key IS NULL OR v_cron_secret IS NULL THEN
    RAISE WARNING 'Auto-release payment configuration is incomplete.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_fn_url,
    body    := '{}'::jsonb,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Cron-Secret', v_cron_secret
    )::jsonb
  );
END;
$$;


ALTER FUNCTION "public"."trigger_auto_release_payments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."warn_inventory_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_capacity_kg NUMERIC := 500000;   -- 500 tons — matches the Owner Inventory page's capacity display
  v_almost_full_kg NUMERIC := 400000; -- 80% of capacity
  v_current_kg NUMERIC;
  v_previous_kg NUMERIC;
  v_row_net_kg NUMERIC;
  v_owner_id UUID;
BEGIN
  -- Serialize concurrent threshold checks so two near-simultaneous
  -- Resecada-affecting writes can never both observe the same
  -- pre-crossing total and both emit a notification.
  PERFORM pg_advisory_xact_lock(hashtextextended('bodega-stock-capacity', 0));

  SELECT COALESCE(SUM(wr.net_weight_kg), 0)
    INTO v_current_kg
  FROM public.inventory_batches ib
  JOIN public.weighing_records wr ON wr.delivery_id = ib.delivery_id
  WHERE ib.batch_status = 'Resecada';

  SELECT wr.net_weight_kg
    INTO v_row_net_kg
  FROM public.weighing_records wr
  WHERE wr.delivery_id = NEW.delivery_id
  LIMIT 1;
  v_row_net_kg := COALESCE(v_row_net_kg, 0);

  IF TG_OP = 'INSERT' THEN
    v_previous_kg := v_current_kg - CASE WHEN NEW.batch_status = 'Resecada' THEN v_row_net_kg ELSE 0 END;
  ELSE
    v_previous_kg := v_current_kg
      - CASE WHEN NEW.batch_status = 'Resecada' THEN v_row_net_kg ELSE 0 END
      + CASE WHEN OLD.batch_status = 'Resecada' THEN v_row_net_kg ELSE 0 END;
  END IF;

  SELECT u.user_id
    INTO v_owner_id
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE r.role_name = 'Business Owner'
    AND u.account_status = 'Active'
  LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    -- 80% — "Almost Full"
    IF v_previous_kg < v_almost_full_kg AND v_current_kg >= v_almost_full_kg THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type)
      VALUES (
        v_owner_id,
        'Inventory Capacity Warning',
        'Bodega Stock is Almost Full: ' || ROUND(v_current_kg / 1000)::INTEGER || 't / ' || ROUND(v_capacity_kg / 1000)::INTEGER || 't. Consider selling soon.',
        'inventory_capacity'
      );
    END IF;

    -- 100% — "Full"
    IF v_previous_kg < v_capacity_kg AND v_current_kg >= v_capacity_kg THEN
      INSERT INTO public.notifications
        (user_id, notification_type, message, related_entity_type)
      VALUES (
        v_owner_id,
        'Inventory Capacity Warning',
        'Bodega Stock is Full: ' || ROUND(v_current_kg / 1000)::INTEGER || 't / ' || ROUND(v_capacity_kg / 1000)::INTEGER || 't. No additional capacity remains — sell or merge before accepting more.',
        'inventory_capacity'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."warn_inventory_capacity"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "bank_account_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bank_name" character varying(120) NOT NULL,
    "account_name" character varying(200) NOT NULL,
    "account_number" character varying(60) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_signatures" (
    "signature_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "signer_id" "uuid" NOT NULL,
    "signer_role" "public"."signer_role_enum" NOT NULL,
    "esignature_file_id" "uuid",
    "signature_order" integer NOT NULL,
    "signed_at" timestamp with time zone,
    "signature_hash" "text",
    "ip_address" "text",
    "user_agent" "text",
    "signature_image_url" "text"
);


ALTER TABLE "public"."contract_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "contract_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_number" character varying(50) NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "business_owner_id" "uuid" NOT NULL,
    "negotiated_price_per_kg" numeric(10,2) NOT NULL,
    "contracted_tons" numeric(10,2) NOT NULL,
    "signing_date" "date",
    "due_date" "date",
    "status" "public"."contract_status_enum" DEFAULT 'Pending'::"public"."contract_status_enum" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activation_date" "date",
    "docuseal_submission_id" "text",
    "docuseal_supplier_slug" "text",
    "docuseal_bo_slug" "text",
    "contract_document_url" "text",
    "delivery_location" "text",
    "special_notes" "text",
    "supplier_authorized_at" timestamp with time zone,
    "bo_signed_at" timestamp with time zone,
    "conversation_id" "uuid",
    "contract_hash" "text",
    "contract_terms_snapshot" "jsonb",
    "bo_reviewed_at" timestamp with time zone,
    "source_proposal_id" "uuid"
);

ALTER TABLE ONLY "public"."contracts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "conversation_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "business_owner_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "status" "public"."conversation_status_enum" DEFAULT 'Open'::"public"."conversation_status_enum" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_proposal_id" "uuid",
    "agreed_price_per_kg" numeric(10,2),
    "agreed_volume_tons" numeric(10,2),
    "negotiation_finalized_at" timestamp with time zone,
    "ai_auto_negotiate" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "delivery_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_source" "public"."delivery_source_enum" NOT NULL,
    "contract_id" "uuid",
    "walkin_supplier_id" "uuid",
    "batch_number" character varying(50),
    "delivery_date" "date" NOT NULL,
    "truck_plate_number" character varying(20),
    "weigher_id" "uuid",
    "lab_staff_id" "uuid",
    "delivery_status" "public"."delivery_status_enum" DEFAULT 'Pending'::"public"."delivery_status_enum" NOT NULL,
    "payment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier_id" "uuid",
    "walkin_paid_at" timestamp with time zone,
    "walkin_paid_by" "uuid",
    "walkin_spot_price_kg" numeric,
    "walkin_amount_paid" numeric
);

ALTER TABLE ONLY "public"."deliveries" REPLICA IDENTITY FULL;


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_allocations" (
    "allocation_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "allocated_weight_kg" numeric(12,3) NOT NULL,
    "price_type" "public"."price_type_enum" DEFAULT 'Negotiated'::"public"."price_type_enum" NOT NULL,
    "sequence_order" integer DEFAULT 1 NOT NULL,
    "spot_price_per_kg_at_delivery" numeric(12,4)
);

ALTER TABLE ONLY "public"."delivery_allocations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_corrections" (
    "correction_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_report_id" "uuid",
    "delivery_id" "uuid" NOT NULL,
    "issue_type" "text" NOT NULL,
    "old_value" numeric(12,3) NOT NULL,
    "corrected_value" numeric(12,3) NOT NULL,
    "submitted_by" "uuid",
    "resolved_by" "uuid" NOT NULL,
    "date_reported" timestamp with time zone NOT NULL,
    "date_resolved" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_corrections_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['Weight Correction'::"text", 'MC Correction'::"text"])))
);


ALTER TABLE "public"."delivery_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_issue_reports" (
    "issue_report_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "issue_note" "text" NOT NULL,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "issue_type" "text" DEFAULT 'General'::"text" NOT NULL,
    "evidence_photo_1_file_id" "uuid",
    "evidence_photo_2_file_id" "uuid",
    "evidence_removed_at" timestamp with time zone,
    CONSTRAINT "delivery_issue_reports_issue_note_check" CHECK ((("char_length"("btrim"("issue_note")) >= 1) AND ("char_length"("btrim"("issue_note")) <= 1000))),
    CONSTRAINT "delivery_issue_reports_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['Weight Correction'::"text", 'MC Correction'::"text", 'General'::"text"]))),
    CONSTRAINT "delivery_issue_reports_status_check" CHECK (("status" = ANY (ARRAY['Open'::"text", 'In Review'::"text", 'Resolved'::"text"])))
);


ALTER TABLE "public"."delivery_issue_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."delivery_issue_reports"."issue_type" IS 'Weight Correction (Weigher) | MC Correction (Lab Staff) | General (legacy free-text reports predating this column).';



COMMENT ON COLUMN "public"."delivery_issue_reports"."evidence_photo_1_file_id" IS 'Weight Correction: photo of the correct weight on the scale/display. MC Correction: photo of the apparatus reading.';



COMMENT ON COLUMN "public"."delivery_issue_reports"."evidence_photo_2_file_id" IS 'Photo of the paper receipt/slip showing the correct recorded value.';



COMMENT ON COLUMN "public"."delivery_issue_reports"."evidence_removed_at" IS 'Set once evidence photos have been deleted from Storage after resolution (storage cost cleanup). The text audit trail in delivery_corrections is NOT affected by this.';



CREATE SEQUENCE IF NOT EXISTS "public"."e_receipt_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."e_receipt_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."e_receipts" (
    "receipt_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "receipt_number" character varying(50) NOT NULL,
    "file_id" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."e_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_uploads" (
    "file_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_by" "uuid",
    "file_category" "public"."file_category_enum" NOT NULL,
    "file_name" character varying(255),
    "file_url" "text" NOT NULL,
    "file_size" bigint,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."file_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_adjustments" (
    "adjustment_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_batch_id" "uuid" NOT NULL,
    "adjusted_by" "uuid",
    "adjustment_reason" "text",
    "old_weight_kg" numeric(12,3) NOT NULL,
    "new_weight_kg" numeric(12,3) NOT NULL,
    "adjusted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_batches" (
    "inventory_batch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "source_type" "public"."inventory_source_type_enum" NOT NULL,
    "batch_status" "public"."inventory_batch_status_enum" DEFAULT 'Walk-in Holding'::"public"."inventory_batch_status_enum" NOT NULL,
    "weight_kg" numeric(12,3) NOT NULL,
    "recorded_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "merge_eligible_date" "date",
    "reviewed_by_user_id" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_decision" "public"."review_decision_enum",
    "merged_at" timestamp with time zone,
    "merged_into_batch_id" "uuid"
);


ALTER TABLE "public"."inventory_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "transaction_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_batch_id" "uuid" NOT NULL,
    "transaction_type" "public"."transaction_type_enum" NOT NULL,
    "quantity_kg" numeric(12,3) NOT NULL,
    "transaction_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "performed_by" "uuid"
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."laboratory_inspections" (
    "inspection_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "lab_staff_id" "uuid" NOT NULL,
    "moisture_content_pct" numeric(5,2) NOT NULL,
    "inspected_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."laboratory_inspections" REPLICA IDENTITY FULL;


ALTER TABLE "public"."laboratory_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_history" (
    "login_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "login_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "login_status" "public"."login_status_enum" NOT NULL
);


ALTER TABLE "public"."login_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_attachments" (
    "attachment_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "file_id" "uuid" NOT NULL
);


ALTER TABLE "public"."message_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "message_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message_type" "public"."message_type_enum" DEFAULT 'Text'::"public"."message_type_enum" NOT NULL,
    "message_text" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_ai_generated" boolean DEFAULT false NOT NULL,
    CONSTRAINT "messages_text_length_check" CHECK (("char_length"("message_text") <= 20000))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "notification_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "public"."notification_type_enum" NOT NULL,
    "message" "text" NOT NULL,
    "related_entity_type" character varying(50),
    "related_entity_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset" (
    "reset_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reset_token" "text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."password_reset" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_details" (
    "payment_detail_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "gross_weight_kg" numeric(12,3) NOT NULL,
    "tare_weight_kg" numeric(12,3) NOT NULL,
    "net_weight_kg" numeric(12,3) NOT NULL,
    "moisture_content_pct" numeric(5,2),
    "moisture_deduction_kg" numeric(12,3) DEFAULT 0 NOT NULL,
    "final_weight_kg" numeric(12,3) NOT NULL,
    "price_type" "public"."price_type_enum" NOT NULL,
    "price_per_kg_used" numeric(10,2) NOT NULL,
    "pca_discount_id" integer,
    "pca_discount_amount" numeric(12,3) DEFAULT 0 NOT NULL,
    "line_amount" numeric(14,2) NOT NULL
);


ALTER TABLE "public"."payment_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "payment_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "business_owner_id" "uuid" NOT NULL,
    "payment_date" "date",
    "payment_week" "date" NOT NULL,
    "total_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "payment_status" "public"."payment_status_enum" DEFAULT 'Pending'::"public"."payment_status_enum" NOT NULL,
    "reference_number" character varying(100),
    "payment_method" "public"."payment_method_enum" DEFAULT 'Bank Transfer'::"public"."payment_method_enum" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "xendit_payout_id" "text"
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pca_discount_table" (
    "discount_id" integer NOT NULL,
    "moisture_content_pct" numeric(4,1) NOT NULL,
    "discount_value" numeric(5,2) NOT NULL,
    "table_version" character varying(20) DEFAULT 'NEW PCA TABLE'::character varying,
    "effective_date" "date" DEFAULT CURRENT_DATE
);


ALTER TABLE "public"."pca_discount_table" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pca_discount_table_discount_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pca_discount_table_discount_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pca_discount_table_discount_id_seq" OWNED BY "public"."pca_discount_table"."discount_id";



CREATE TABLE IF NOT EXISTS "public"."proposal_forms" (
    "proposal_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "proposed_price_per_kg" numeric(10,2) NOT NULL,
    "proposed_volume_tons" numeric(10,2) NOT NULL,
    "proposal_status" "public"."proposal_status_enum" DEFAULT 'Pending'::"public"."proposal_status_enum" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "counter_price_per_kg" numeric(10,2),
    "supersedes_proposal_id" "uuid",
    "submitted_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "is_ai_generated" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."proposal_forms" REPLICA IDENTITY FULL;


ALTER TABLE "public"."proposal_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quality_results" (
    "quality_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "result" "public"."quality_result_enum" NOT NULL,
    "remarks" "text",
    "evaluated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."quality_results" REPLICA IDENTITY FULL;


ALTER TABLE "public"."quality_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rate_limit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rate_limit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rate_limit_log_id_seq" OWNED BY "public"."rate_limit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "role_id" integer NOT NULL,
    "role_name" character varying(50) NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."roles_role_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."roles_role_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."roles_role_id_seq" OWNED BY "public"."roles"."role_id";



CREATE TABLE IF NOT EXISTS "public"."spot_price" (
    "spot_price_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_per_kg" numeric(10,2) NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spot_price" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_performance_snapshot" (
    "snapshot_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "snapshot_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "contract_fulfillment_score" numeric(5,2),
    "delivered_volume_score" numeric(5,2),
    "copra_quality_score" numeric(5,2),
    "performance_score" numeric(5,2),
    "supplier_rating" integer,
    "overall_supplier_rating" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supplier_performance_snapshot_supplier_rating_check" CHECK ((("supplier_rating" >= 1) AND ("supplier_rating" <= 5)))
);


ALTER TABLE "public"."supplier_performance_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_verify" (
    "verify_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gov_id_file_id" "uuid",
    "esign_file_id" "uuid",
    "verify_status" "public"."verify_status_enum" DEFAULT 'Pending'::"public"."verify_status_enum" NOT NULL,
    "review_by" "uuid",
    "reviewed_at" timestamp with time zone
);


ALTER TABLE "public"."user_verify" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "user_id" "uuid" NOT NULL,
    "role_id" integer,
    "first_name" character varying(100),
    "last_name" character varying(100),
    "email" character varying(255) NOT NULL,
    "phone" character varying(30),
    "address" "text",
    "account_status" "public"."account_status_enum" DEFAULT 'Pending'::"public"."account_status_enum" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."walkin_suppliers" (
    "walkin_supplier_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "address" "text",
    "phone" character varying(30),
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."walkin_suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weighing_records" (
    "weighing_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "weigher_id" "uuid" NOT NULL,
    "gross_weight_kg" numeric(12,3) NOT NULL,
    "tare_weight_kg" numeric(12,3) NOT NULL,
    "net_weight_kg" numeric(12,3) NOT NULL,
    "weighed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "copra_condition" character varying(4) DEFAULT 'Dry'::character varying NOT NULL,
    "num_sacks" integer,
    CONSTRAINT "weighing_records_copra_condition_check" CHECK ((("copra_condition")::"text" = ANY ((ARRAY['Dry'::character varying, 'Wet'::character varying])::"text"[])))
);

ALTER TABLE ONLY "public"."weighing_records" REPLICA IDENTITY FULL;


ALTER TABLE "public"."weighing_records" OWNER TO "postgres";


ALTER TABLE ONLY "public"."pca_discount_table" ALTER COLUMN "discount_id" SET DEFAULT "nextval"('"public"."pca_discount_table_discount_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rate_limit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rate_limit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."roles" ALTER COLUMN "role_id" SET DEFAULT "nextval"('"public"."roles_role_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("audit_id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("bank_account_id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("signature_id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_contract_number_key" UNIQUE ("contract_number");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("contract_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_supplier_bo_unique" UNIQUE ("supplier_id", "business_owner_id");



ALTER TABLE ONLY "public"."copra_sales"
    ADD CONSTRAINT "copra_sales_pkey" PRIMARY KEY ("copra_sale_id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("delivery_id");



ALTER TABLE ONLY "public"."delivery_allocations"
    ADD CONSTRAINT "delivery_allocations_pkey" PRIMARY KEY ("allocation_id");



ALTER TABLE ONLY "public"."delivery_corrections"
    ADD CONSTRAINT "delivery_corrections_pkey" PRIMARY KEY ("correction_id");



ALTER TABLE ONLY "public"."delivery_issue_reports"
    ADD CONSTRAINT "delivery_issue_reports_pkey" PRIMARY KEY ("issue_report_id");



ALTER TABLE ONLY "public"."e_receipts"
    ADD CONSTRAINT "e_receipts_pkey" PRIMARY KEY ("receipt_id");



ALTER TABLE ONLY "public"."e_receipts"
    ADD CONSTRAINT "e_receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."file_uploads"
    ADD CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("file_id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("adjustment_id");



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("inventory_batch_id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("transaction_id");



ALTER TABLE ONLY "public"."laboratory_inspections"
    ADD CONSTRAINT "laboratory_inspections_pkey" PRIMARY KEY ("inspection_id");



ALTER TABLE ONLY "public"."login_history"
    ADD CONSTRAINT "login_history_pkey" PRIMARY KEY ("login_id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("attachment_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id");



ALTER TABLE ONLY "public"."password_reset"
    ADD CONSTRAINT "password_reset_pkey" PRIMARY KEY ("reset_id");



ALTER TABLE ONLY "public"."payment_details"
    ADD CONSTRAINT "payment_details_pkey" PRIMARY KEY ("payment_detail_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id");



ALTER TABLE ONLY "public"."pca_discount_table"
    ADD CONSTRAINT "pca_discount_table_moisture_content_pct_key" UNIQUE ("moisture_content_pct");



ALTER TABLE ONLY "public"."pca_discount_table"
    ADD CONSTRAINT "pca_discount_table_pkey" PRIMARY KEY ("discount_id");



ALTER TABLE ONLY "public"."proposal_forms"
    ADD CONSTRAINT "proposal_forms_pkey" PRIMARY KEY ("proposal_id");



ALTER TABLE ONLY "public"."quality_results"
    ADD CONSTRAINT "quality_results_pkey" PRIMARY KEY ("quality_id");



ALTER TABLE ONLY "public"."rate_limit_log"
    ADD CONSTRAINT "rate_limit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_role_name_key" UNIQUE ("role_name");



ALTER TABLE ONLY "public"."spot_price"
    ADD CONSTRAINT "spot_price_pkey" PRIMARY KEY ("spot_price_id");



ALTER TABLE ONLY "public"."supplier_performance_snapshot"
    ADD CONSTRAINT "supplier_performance_snapshot_pkey" PRIMARY KEY ("snapshot_id");



ALTER TABLE ONLY "public"."user_verify"
    ADD CONSTRAINT "user_verify_pkey" PRIMARY KEY ("verify_id");



ALTER TABLE ONLY "public"."user_verify"
    ADD CONSTRAINT "user_verify_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."walkin_suppliers"
    ADD CONSTRAINT "walkin_suppliers_pkey" PRIMARY KEY ("walkin_supplier_id");



ALTER TABLE ONLY "public"."weighing_records"
    ADD CONSTRAINT "weighing_records_pkey" PRIMARY KEY ("weighing_id");



CREATE UNIQUE INDEX "contracts_one_per_conversation" ON "public"."contracts" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE UNIQUE INDEX "contracts_source_proposal_unique" ON "public"."contracts" USING "btree" ("source_proposal_id") WHERE ("source_proposal_id" IS NOT NULL);



CREATE UNIQUE INDEX "e_receipts_payment_id_key" ON "public"."e_receipts" USING "btree" ("payment_id");



CREATE INDEX "idx_bank_accounts_user" ON "public"."bank_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_rate_limit_log_user_action_time" ON "public"."rate_limit_log" USING "btree" ("user_id", "action", "created_at" DESC);



CREATE UNIQUE INDEX "supplier_performance_snapshot_contract_unique" ON "public"."supplier_performance_snapshot" USING "btree" ("contract_id") WHERE ("contract_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "aa_first_time_supplier_proposal_guard" BEFORE INSERT ON "public"."proposal_forms" FOR EACH ROW EXECUTE FUNCTION "public"."guard_first_time_supplier_proposal"();



CREATE OR REPLACE TRIGGER "ai_negotiate_on_proposal" AFTER INSERT ON "public"."proposal_forms" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_ai_negotiate"();



CREATE OR REPLACE TRIGGER "contract_activation_trigger" BEFORE UPDATE ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."on_contract_activated"();



CREATE OR REPLACE TRIGGER "contract_signatures_no_update" BEFORE DELETE OR UPDATE ON "public"."contract_signatures" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_signature_mutation"();



CREATE OR REPLACE TRIGGER "enforce_active_contract_limit" BEFORE INSERT OR UPDATE OF "status", "supplier_id" ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_active_contract_limit"();



CREATE OR REPLACE TRIGGER "guard_current_proposal" BEFORE INSERT OR UPDATE OF "proposal_status" ON "public"."proposal_forms" FOR EACH ROW EXECUTE FUNCTION "public"."guard_current_proposal"();



CREATE OR REPLACE TRIGGER "inventory_capacity_warning_trigger" AFTER INSERT OR UPDATE OF "weight_kg", "batch_status" ON "public"."inventory_batches" FOR EACH ROW EXECUTE FUNCTION "public"."warn_inventory_capacity"();



CREATE OR REPLACE TRIGGER "on_contract_status_change" AFTER UPDATE OF "status" ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_contract_status_change"();



CREATE OR REPLACE TRIGGER "on_walkin_batch_created" BEFORE INSERT ON "public"."inventory_batches" FOR EACH ROW EXECUTE FUNCTION "public"."handle_walkin_batch_created"();



CREATE OR REPLACE TRIGGER "trg_apply_final_weight_to_allocations" AFTER INSERT ON "public"."quality_results" FOR EACH ROW EXECUTE FUNCTION "public"."apply_final_weight_to_allocations"();



CREATE OR REPLACE TRIGGER "trg_messages_rate_limit" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_messages_rate_limit"();



CREATE OR REPLACE TRIGGER "trg_proposals_rate_limit" BEFORE INSERT ON "public"."proposal_forms" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_proposals_rate_limit"();



CREATE OR REPLACE TRIGGER "trigger_check_contract_completion" AFTER UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."check_contract_completion_on_acceptance"();



CREATE OR REPLACE TRIGGER "trigger_enforce_delivery_allocation_cap" BEFORE INSERT OR UPDATE ON "public"."delivery_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_delivery_allocation_cap"();



CREATE OR REPLACE TRIGGER "zz_sync_proposal_conversation_state" BEFORE INSERT ON "public"."proposal_forms" FOR EACH ROW EXECUTE FUNCTION "public"."sync_proposal_conversation_state"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("contract_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_esignature_file_id_fkey" FOREIGN KEY ("esignature_file_id") REFERENCES "public"."file_uploads"("file_id");



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_business_owner_id_fkey" FOREIGN KEY ("business_owner_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_source_proposal_id_fkey" FOREIGN KEY ("source_proposal_id") REFERENCES "public"."proposal_forms"("proposal_id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_accepted_proposal_id_fkey" FOREIGN KEY ("accepted_proposal_id") REFERENCES "public"."proposal_forms"("proposal_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_business_owner_id_fkey" FOREIGN KEY ("business_owner_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."copra_sales"
    ADD CONSTRAINT "copra_sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("contract_id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_lab_staff_id_fkey" FOREIGN KEY ("lab_staff_id") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_walkin_paid_by_fkey" FOREIGN KEY ("walkin_paid_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_walkin_supplier_id_fkey" FOREIGN KEY ("walkin_supplier_id") REFERENCES "public"."walkin_suppliers"("walkin_supplier_id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_weigher_id_fkey" FOREIGN KEY ("weigher_id") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_allocations"
    ADD CONSTRAINT "delivery_allocations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("contract_id");



ALTER TABLE ONLY "public"."delivery_allocations"
    ADD CONSTRAINT "delivery_allocations_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_corrections"
    ADD CONSTRAINT "delivery_corrections_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_corrections"
    ADD CONSTRAINT "delivery_corrections_issue_report_id_fkey" FOREIGN KEY ("issue_report_id") REFERENCES "public"."delivery_issue_reports"("issue_report_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_corrections"
    ADD CONSTRAINT "delivery_corrections_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."delivery_corrections"
    ADD CONSTRAINT "delivery_corrections_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."delivery_issue_reports"
    ADD CONSTRAINT "delivery_issue_reports_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_issue_reports"
    ADD CONSTRAINT "delivery_issue_reports_evidence_photo_1_file_id_fkey" FOREIGN KEY ("evidence_photo_1_file_id") REFERENCES "public"."file_uploads"("file_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_issue_reports"
    ADD CONSTRAINT "delivery_issue_reports_evidence_photo_2_file_id_fkey" FOREIGN KEY ("evidence_photo_2_file_id") REFERENCES "public"."file_uploads"("file_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_issue_reports"
    ADD CONSTRAINT "delivery_issue_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_issue_reports"
    ADD CONSTRAINT "delivery_issue_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."e_receipts"
    ADD CONSTRAINT "e_receipts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."file_uploads"("file_id");



ALTER TABLE ONLY "public"."e_receipts"
    ADD CONSTRAINT "e_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_uploads"
    ADD CONSTRAINT "file_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "fk_conversations_contract" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("contract_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "fk_delivery_payment" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "public"."inventory_batches"("inventory_batch_id");



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id");



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_merged_into_batch_id_fkey" FOREIGN KEY ("merged_into_batch_id") REFERENCES "public"."inventory_batches"("inventory_batch_id");



ALTER TABLE ONLY "public"."inventory_batches"
    ADD CONSTRAINT "inventory_batches_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "public"."inventory_batches"("inventory_batch_id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."laboratory_inspections"
    ADD CONSTRAINT "laboratory_inspections_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."laboratory_inspections"
    ADD CONSTRAINT "laboratory_inspections_lab_staff_id_fkey" FOREIGN KEY ("lab_staff_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."login_history"
    ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."file_uploads"("file_id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("message_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset"
    ADD CONSTRAINT "password_reset_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_details"
    ADD CONSTRAINT "payment_details_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id");



ALTER TABLE ONLY "public"."payment_details"
    ADD CONSTRAINT "payment_details_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_details"
    ADD CONSTRAINT "payment_details_pca_discount_id_fkey" FOREIGN KEY ("pca_discount_id") REFERENCES "public"."pca_discount_table"("discount_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_business_owner_id_fkey" FOREIGN KEY ("business_owner_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_forms"
    ADD CONSTRAINT "proposal_forms_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id");



ALTER TABLE ONLY "public"."proposal_forms"
    ADD CONSTRAINT "proposal_forms_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposal_forms"
    ADD CONSTRAINT "proposal_forms_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."proposal_forms"
    ADD CONSTRAINT "proposal_forms_supersedes_proposal_id_fkey" FOREIGN KEY ("supersedes_proposal_id") REFERENCES "public"."proposal_forms"("proposal_id");



ALTER TABLE ONLY "public"."proposal_forms"
    ADD CONSTRAINT "proposal_forms_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quality_results"
    ADD CONSTRAINT "quality_results_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quality_results"
    ADD CONSTRAINT "quality_results_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."laboratory_inspections"("inspection_id");



ALTER TABLE ONLY "public"."spot_price"
    ADD CONSTRAINT "spot_price_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_performance_snapshot"
    ADD CONSTRAINT "supplier_performance_snapshot_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("contract_id");



ALTER TABLE ONLY "public"."supplier_performance_snapshot"
    ADD CONSTRAINT "supplier_performance_snapshot_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_verify"
    ADD CONSTRAINT "user_verify_esign_file_id_fkey" FOREIGN KEY ("esign_file_id") REFERENCES "public"."file_uploads"("file_id");



ALTER TABLE ONLY "public"."user_verify"
    ADD CONSTRAINT "user_verify_gov_id_file_id_fkey" FOREIGN KEY ("gov_id_file_id") REFERENCES "public"."file_uploads"("file_id");



ALTER TABLE ONLY "public"."user_verify"
    ADD CONSTRAINT "user_verify_review_by_fkey" FOREIGN KEY ("review_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_verify"
    ADD CONSTRAINT "user_verify_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."walkin_suppliers"
    ADD CONSTRAINT "walkin_suppliers_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weighing_records"
    ADD CONSTRAINT "weighing_records_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weighing_records"
    ADD CONSTRAINT "weighing_records_weigher_id_fkey" FOREIGN KEY ("weigher_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_config_bo_delete" ON "public"."app_config" FOR DELETE USING ((("public"."get_my_role"() = 'Business Owner'::"text") AND ("key" = ANY (ARRAY['ai_auto_negotiate_global'::"text", 'ai_faq_global'::"text"]))));



CREATE POLICY "app_config_bo_insert" ON "public"."app_config" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'Business Owner'::"text") AND ("key" = ANY (ARRAY['ai_auto_negotiate_global'::"text", 'ai_faq_global'::"text"]))));



CREATE POLICY "app_config_bo_read" ON "public"."app_config" FOR SELECT USING ((("public"."get_my_role"() = 'Business Owner'::"text") AND ("key" = ANY (ARRAY['ai_auto_negotiate_global'::"text", 'ai_faq_global'::"text"]))));



CREATE POLICY "app_config_bo_update" ON "public"."app_config" FOR UPDATE USING ((("public"."get_my_role"() = 'Business Owner'::"text") AND ("key" = ANY (ARRAY['ai_auto_negotiate_global'::"text", 'ai_faq_global'::"text"])))) WITH CHECK ((("public"."get_my_role"() = 'Business Owner'::"text") AND ("key" = ANY (ARRAY['ai_auto_negotiate_global'::"text", 'ai_faq_global'::"text"]))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_select_bo" ON "public"."audit_logs" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_accounts_bo_select" ON "public"."bank_accounts" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "bank_accounts_self_manage" ON "public"."bank_accounts" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."contract_signatures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contract_signatures_insert" ON "public"."contract_signatures" FOR INSERT WITH CHECK ((("signer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."contract_id" = "contract_signatures"."contract_id") AND ("c"."business_owner_id" = "auth"."uid"()) AND ("public"."get_my_role"() = 'Business Owner'::"text"))))));



CREATE POLICY "contract_signatures_select" ON "public"."contract_signatures" FOR SELECT USING ((("signer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."contract_id" = "contract_signatures"."contract_id") AND (("c"."supplier_id" = "auth"."uid"()) OR ("c"."business_owner_id" = "auth"."uid"())))))));



ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contracts_insert_bo" ON "public"."contracts" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "contracts_insert_supplier" ON "public"."contracts" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'Supplier'::"text") AND ("supplier_id" = "auth"."uid"())));



CREATE POLICY "contracts_select" ON "public"."contracts" FOR SELECT USING ((("supplier_id" = "auth"."uid"()) OR ("business_owner_id" = "auth"."uid"()) OR (("public"."get_my_role"() = 'Laboratory Staff'::"text") AND ("status" = 'Active'::"public"."contract_status_enum") AND "public"."lab_staff_contract_visible"("contract_id"))));



CREATE POLICY "contracts_update_bo" ON "public"."contracts" FOR UPDATE USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert" ON "public"."conversations" FOR INSERT WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Supplier'::"text", 'Business Owner'::"text"])));



CREATE POLICY "conversations_select" ON "public"."conversations" FOR SELECT USING ((("supplier_id" = "auth"."uid"()) OR ("business_owner_id" = "auth"."uid"())));



CREATE POLICY "conversations_update" ON "public"."conversations" FOR UPDATE USING ((("supplier_id" = "auth"."uid"()) OR ("business_owner_id" = "auth"."uid"())));



ALTER TABLE "public"."copra_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "copra_sales_select" ON "public"."copra_sales" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deliveries_insert" ON "public"."deliveries" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Weigher'::"text"));



CREATE POLICY "deliveries_select" ON "public"."deliveries" FOR SELECT USING ((("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Weigher'::"text", 'Laboratory Staff'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."contracts" "c"
  WHERE (("c"."contract_id" = "deliveries"."contract_id") AND ("c"."supplier_id" = "auth"."uid"()))))));



CREATE POLICY "deliveries_update" ON "public"."deliveries" FOR UPDATE USING (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Weigher'::"text", 'Laboratory Staff'::"text"])));



ALTER TABLE "public"."delivery_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_allocations_insert_weigher" ON "public"."delivery_allocations" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'Weigher'::"text"));



CREATE POLICY "delivery_allocations_select_bo" ON "public"."delivery_allocations" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "delivery_allocations_select_lab" ON "public"."delivery_allocations" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'Laboratory Staff'::"text"));



CREATE POLICY "delivery_allocations_select_supplier" ON "public"."delivery_allocations" FOR SELECT TO "authenticated" USING ((("public"."get_my_role"() = 'Supplier'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."deliveries" "d"
  WHERE (("d"."delivery_id" = "delivery_allocations"."delivery_id") AND ("d"."supplier_id" = "auth"."uid"()))))));



CREATE POLICY "delivery_allocations_select_weigher" ON "public"."delivery_allocations" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'Weigher'::"text"));



ALTER TABLE "public"."delivery_corrections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_corrections_select" ON "public"."delivery_corrections" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."delivery_issue_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_issue_reports_insert" ON "public"."delivery_issue_reports" FOR INSERT WITH CHECK ((("reported_by" = "auth"."uid"()) AND ((("public"."get_my_role"() = 'Weigher'::"text") AND ("issue_type" = 'Weight Correction'::"text")) OR (("public"."get_my_role"() = 'Laboratory Staff'::"text") AND ("issue_type" = 'MC Correction'::"text")))));



CREATE POLICY "delivery_issue_reports_select" ON "public"."delivery_issue_reports" FOR SELECT USING ((("reported_by" = "auth"."uid"()) OR ("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Laboratory Staff'::"text"]))));



CREATE POLICY "delivery_issue_reports_update" ON "public"."delivery_issue_reports" FOR UPDATE USING (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Laboratory Staff'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Laboratory Staff'::"text"])));



ALTER TABLE "public"."e_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "e_receipts_insert_bo" ON "public"."e_receipts" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "e_receipts_select" ON "public"."e_receipts" FOR SELECT USING ((("public"."get_my_role"() = 'Business Owner'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE (("p"."payment_id" = "e_receipts"."payment_id") AND ("p"."supplier_id" = "auth"."uid"()))))));



ALTER TABLE "public"."file_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "file_uploads_insert" ON "public"."file_uploads" FOR INSERT WITH CHECK (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "file_uploads_select" ON "public"."file_uploads" FOR SELECT USING ((("uploaded_by" = "auth"."uid"()) OR ("public"."get_my_role"() = 'Business Owner'::"text")));



ALTER TABLE "public"."inventory_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_adjustments_insert_bo" ON "public"."inventory_adjustments" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "inventory_adjustments_select" ON "public"."inventory_adjustments" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."inventory_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_batches_insert" ON "public"."inventory_batches" FOR INSERT WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Weigher'::"text", 'Laboratory Staff'::"text"])));



CREATE POLICY "inventory_batches_select" ON "public"."inventory_batches" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Weigher'::"text", 'Laboratory Staff'::"text"])));



CREATE POLICY "inventory_batches_update_bo" ON "public"."inventory_batches" FOR UPDATE USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_transactions_insert" ON "public"."inventory_transactions" FOR INSERT WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Weigher'::"text"])));



CREATE POLICY "inventory_transactions_select" ON "public"."inventory_transactions" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "lab_inspections_insert" ON "public"."laboratory_inspections" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'Laboratory Staff'::"text") AND ("lab_staff_id" = "auth"."uid"())));



CREATE POLICY "lab_inspections_select" ON "public"."laboratory_inspections" FOR SELECT USING ((("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Laboratory Staff'::"text"])) OR ("lab_staff_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."deliveries" "d"
     JOIN "public"."contracts" "c" ON (("c"."contract_id" = "d"."contract_id")))
  WHERE (("d"."delivery_id" = "laboratory_inspections"."delivery_id") AND ("c"."supplier_id" = "auth"."uid"()))))));



ALTER TABLE "public"."laboratory_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "login_history_insert" ON "public"."login_history" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "login_history_select_bo" ON "public"."login_history" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "login_history_select_own" ON "public"."login_history" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_attachments_insert" ON "public"."message_attachments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."message_id" = "message_attachments"."message_id") AND ("m"."sender_id" = "auth"."uid"())))));



CREATE POLICY "message_attachments_select" ON "public"."message_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversations" "c" ON (("c"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."message_id" = "message_attachments"."message_id") AND (("c"."supplier_id" = "auth"."uid"()) OR ("c"."business_owner_id" = "auth"."uid"()))))));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "messages"."conversation_id") AND (("c"."supplier_id" = "auth"."uid"()) OR ("c"."business_owner_id" = "auth"."uid"())))))));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "messages"."conversation_id") AND (("c"."supplier_id" = "auth"."uid"()) OR ("c"."business_owner_id" = "auth"."uid"()))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (("user_id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'Business Owner'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE ((("c"."business_owner_id" = "auth"."uid"()) AND ("c"."supplier_id" = "notifications"."user_id")) OR (("c"."supplier_id" = "auth"."uid"()) AND ("c"."business_owner_id" = "notifications"."user_id"))))) OR (("public"."get_my_role"() = 'Laboratory Staff'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."contracts" "ct"
  WHERE ("ct"."supplier_id" = "notifications"."user_id")))))));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."password_reset" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "password_reset_own" ON "public"."password_reset" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."payment_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_details_insert_bo" ON "public"."payment_details" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "payment_details_select" ON "public"."payment_details" FOR SELECT USING ((("public"."get_my_role"() = 'Business Owner'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE (("p"."payment_id" = "payment_details"."payment_id") AND ("p"."supplier_id" = "auth"."uid"()))))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_insert_bo" ON "public"."payments" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT USING ((("supplier_id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'Business Owner'::"text")));



CREATE POLICY "payments_update_bo" ON "public"."payments" FOR UPDATE USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."pca_discount_table" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pca_select_all" ON "public"."pca_discount_table" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "perf_snapshot_select" ON "public"."supplier_performance_snapshot" FOR SELECT USING ((("supplier_id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'Business Owner'::"text")));



ALTER TABLE "public"."proposal_forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proposals_insert" ON "public"."proposal_forms" FOR INSERT WITH CHECK (((("public"."get_my_role"() = 'Supplier'::"text") AND ("supplier_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "proposal_forms"."conversation_id") AND ("c"."supplier_id" = "auth"."uid"())))) AND (("supersedes_proposal_id" IS NOT NULL) OR (( SELECT "count"(*) AS "count"
   FROM "public"."contracts" "c"
  WHERE (("c"."supplier_id" = "auth"."uid"()) AND ("c"."status" = 'Active'::"public"."contract_status_enum"))) < 3))) OR (("public"."get_my_role"() = 'Business Owner'::"text") AND ("supersedes_proposal_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "proposal_forms"."conversation_id") AND ("c"."business_owner_id" = "auth"."uid"())))))));



CREATE POLICY "proposals_select" ON "public"."proposal_forms" FOR SELECT USING ((("supplier_id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'Business Owner'::"text")));



CREATE POLICY "proposals_update" ON "public"."proposal_forms" FOR UPDATE USING ((("proposal_status" = 'Pending'::"public"."proposal_status_enum") AND ("submitted_by" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "conversation"
  WHERE (("conversation"."conversation_id" = "proposal_forms"."conversation_id") AND ("conversation"."negotiation_finalized_at" IS NULL) AND (("conversation"."business_owner_id" = "auth"."uid"()) OR ("conversation"."supplier_id" = "auth"."uid"()))))))) WITH CHECK ((("submitted_by" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "conversation"
  WHERE (("conversation"."conversation_id" = "proposal_forms"."conversation_id") AND ("conversation"."negotiation_finalized_at" IS NULL) AND (("conversation"."business_owner_id" = "auth"."uid"()) OR ("conversation"."supplier_id" = "auth"."uid"())))))));



ALTER TABLE "public"."quality_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quality_results_insert" ON "public"."quality_results" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Laboratory Staff'::"text"));



CREATE POLICY "quality_results_select" ON "public"."quality_results" FOR SELECT USING ((("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Laboratory Staff'::"text"])) OR (EXISTS ( SELECT 1
   FROM ("public"."deliveries" "d"
     JOIN "public"."contracts" "c" ON (("c"."contract_id" = "d"."contract_id")))
  WHERE (("d"."delivery_id" = "quality_results"."delivery_id") AND ("c"."supplier_id" = "auth"."uid"()))))));



ALTER TABLE "public"."rate_limit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rate_limit_log_no_client_access" ON "public"."rate_limit_log" USING (false) WITH CHECK (false);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select_all" ON "public"."roles" FOR SELECT USING (true);



ALTER TABLE "public"."spot_price" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "spot_price_insert_bo" ON "public"."spot_price" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "spot_price_select" ON "public"."spot_price" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "spot_price_update_bo" ON "public"."spot_price" FOR UPDATE USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."supplier_performance_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_verify" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_verify_insert_own" ON "public"."user_verify" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_verify_owner_insert" ON "public"."user_verify" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_verify_owner_update_esign" ON "public"."user_verify" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_verify_select_bo" ON "public"."user_verify" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "user_verify_select_own" ON "public"."user_verify" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_verify_update_bo" ON "public"."user_verify" FOR UPDATE USING (("public"."get_my_role"() = 'Business Owner'::"text"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_select_bo" ON "public"."users" FOR SELECT USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "users_select_business_owner" ON "public"."users" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."role_id" = "users"."role_id") AND (("r"."role_name")::"text" = 'Business Owner'::"text")))));



CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_select_staff_by_supplier" ON "public"."users" FOR SELECT USING ((("public"."get_my_role"() = 'Supplier'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."role_id" = "users"."role_id") AND (("r"."role_name")::"text" = ANY ((ARRAY['Weigher'::character varying, 'Laboratory Staff'::character varying])::"text"[])))))));



CREATE POLICY "users_select_weigher_suppliers" ON "public"."users" FOR SELECT USING ((("public"."get_my_role"() = ANY (ARRAY['Weigher'::"text", 'Laboratory Staff'::"text"])) AND ("account_status" = 'Active'::"public"."account_status_enum") AND (EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."role_id" = "users"."role_id") AND (("r"."role_name")::"text" = 'Supplier'::"text"))))));



CREATE POLICY "users_update_bo" ON "public"."users" FOR UPDATE USING (("public"."get_my_role"() = 'Business Owner'::"text"));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."walkin_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "walkin_suppliers_insert" ON "public"."walkin_suppliers" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'Weigher'::"text"));



CREATE POLICY "walkin_suppliers_select" ON "public"."walkin_suppliers" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Weigher'::"text"])));



ALTER TABLE "public"."weighing_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weighing_records_insert" ON "public"."weighing_records" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'Weigher'::"text") AND ("weigher_id" = "auth"."uid"())));



CREATE POLICY "weighing_records_select" ON "public"."weighing_records" FOR SELECT USING ((("weigher_id" = "auth"."uid"()) OR ("public"."get_my_role"() = ANY (ARRAY['Business Owner'::"text", 'Laboratory Staff'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."deliveries" "d"
  WHERE (("d"."delivery_id" = "weighing_records"."delivery_id") AND ("d"."supplier_id" = "auth"."uid"()))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contracts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deliveries";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."delivery_allocations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."laboratory_inspections";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."proposal_forms";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."quality_results";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."weighing_records";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."accept_counteroffer_and_create_contract"("p_proposal_id" "uuid", "p_supplier_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_counteroffer_and_create_contract"("p_proposal_id" "uuid", "p_supplier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_counteroffer_and_create_contract"("p_proposal_id" "uuid", "p_supplier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_counteroffer_and_create_contract"("p_proposal_id" "uuid", "p_supplier_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_negotiation_and_create_contract"("p_proposal_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_negotiation_and_create_contract"("p_proposal_id" "uuid", "p_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_negotiation_and_create_contract"("p_proposal_id" "uuid", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_negotiation_and_create_contract"("p_proposal_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_delivery_correction"("p_issue_report_id" "uuid", "p_corrected_value" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_delivery_correction"("p_issue_report_id" "uuid", "p_corrected_value" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_delivery_correction"("p_issue_report_id" "uuid", "p_corrected_value" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_delivery_correction"("p_issue_report_id" "uuid", "p_corrected_value" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_final_weight_to_allocations"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_final_weight_to_allocations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_final_weight_to_allocations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_weight_correction"("p_issue_report_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric, "p_num_sacks" integer, "p_condition" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_weight_correction"("p_issue_report_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric, "p_num_sacks" integer, "p_condition" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_weight_correction"("p_issue_report_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric, "p_num_sacks" integer, "p_condition" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_weight_correction"("p_issue_report_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric, "p_num_sacks" integer, "p_condition" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_breach_overdue_contracts"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_breach_overdue_contracts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_breach_overdue_contracts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_complete_fulfilled_contracts"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_complete_fulfilled_contracts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_complete_fulfilled_contracts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_contract_completion_on_acceptance"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_contract_completion_on_acceptance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_contract_completion_on_acceptance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_contract_deadlines"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_contract_deadlines"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_contract_deadlines"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_merge_eligibility"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_merge_eligibility"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_merge_eligibility"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_issue_evidence"("p_issue_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_issue_evidence"("p_issue_report_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_issue_evidence"("p_issue_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_issue_evidence"("p_issue_report_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_supplier_rating"("p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_supplier_rating"("p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_supplier_rating"("p_contract_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contract_allocation_detail"("p_contract_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contract_allocation_detail"("p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."contract_allocation_detail"("p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contract_allocation_detail"("p_contract_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contract_allocation_reconciliation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contract_allocation_reconciliation"() TO "anon";
GRANT ALL ON FUNCTION "public"."contract_allocation_reconciliation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contract_allocation_reconciliation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_payment_batch"("p_supplier_id" "uuid", "p_business_owner_id" "uuid", "p_payment_week" "date", "p_total_amount" numeric, "p_notification_msg" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_payment_batch"("p_supplier_id" "uuid", "p_business_owner_id" "uuid", "p_payment_week" "date", "p_total_amount" numeric, "p_notification_msg" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_payment_batch"("p_supplier_id" "uuid", "p_business_owner_id" "uuid", "p_payment_week" "date", "p_total_amount" numeric, "p_notification_msg" "text", "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_payment_receipt"("p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_payment_receipt"("p_payment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_current_proposal"("p_proposal_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_current_proposal"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decline_current_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_current_proposal"("p_proposal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_active_contract_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_active_contract_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_active_contract_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_delivery_allocation_cap"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_delivery_allocation_cap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_delivery_allocation_cap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_messages_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_messages_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_messages_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_proposals_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_proposals_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_proposals_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_negotiation"("p_proposal_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_negotiation"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_negotiation"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_negotiation"("p_proposal_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_successful_payment"("p_payment_id" "uuid", "p_reference_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_successful_payment"("p_payment_id" "uuid", "p_reference_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_auth_user_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_auth_user_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_auth_user_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_contract_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_contract_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_contract_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_current_proposal"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_current_proposal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_current_proposal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_first_time_supplier_proposal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_first_time_supplier_proposal"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_first_time_supplier_proposal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_first_time_supplier_proposal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_contract_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_contract_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_contract_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_walkin_batch_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_walkin_batch_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_walkin_batch_created"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lab_staff_contract_visible"("p_contract_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lab_staff_contract_visible"("p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lab_staff_contract_visible"("p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lab_staff_contract_visible"("p_contract_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_contract_activated"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_contract_activated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_contract_activated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_signature_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_signature_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_signature_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_contract_chat"("p_contract_id" "uuid", "p_conversation_id" "uuid", "p_is_ai_generated" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_contract_chat"("p_contract_id" "uuid", "p_conversation_id" "uuid", "p_is_ai_generated" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."publish_contract_chat"("p_contract_id" "uuid", "p_conversation_id" "uuid", "p_is_ai_generated" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_contract_chat"("p_contract_id" "uuid", "p_conversation_id" "uuid", "p_is_ai_generated" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_delivery_allocation"("p_delivery_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_delivery_allocation"("p_delivery_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_delivery_allocation"("p_delivery_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_audit_log"("p_action" "text", "p_entity_type" character varying, "p_entity_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_audit_log"("p_action" "text", "p_entity_type" character varying, "p_entity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_audit_log"("p_action" "text", "p_entity_type" character varying, "p_entity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_audit_log"("p_action" "text", "p_entity_type" character varying, "p_entity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_contractual_delivery"("p_supplier_id" "uuid", "p_weigher_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."record_contractual_delivery"("p_supplier_id" "uuid", "p_weigher_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_contractual_delivery"("p_supplier_id" "uuid", "p_weigher_id" "uuid", "p_delivery_date" "date", "p_truck_plate" "text", "p_gross_kg" numeric, "p_tare_kg" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."copra_sales" TO "anon";
GRANT ALL ON TABLE "public"."copra_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."copra_sales" TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_copra_sale"("p_date_sold" "date", "p_net_weight_kg" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_copra_sale"("p_date_sold" "date", "p_net_weight_kg" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."record_copra_sale"("p_date_sold" "date", "p_net_weight_kg" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_copra_sale"("p_date_sold" "date", "p_net_weight_kg" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_owner_assistance"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_owner_assistance"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_owner_assistance"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_owner_assistance"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_proposal_conversation_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_proposal_conversation_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_proposal_conversation_state"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_ai_negotiate"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_ai_negotiate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_ai_negotiate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_auto_release_payments"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_auto_release_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_auto_release_payments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."warn_inventory_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."warn_inventory_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."warn_inventory_capacity"() TO "service_role";
























GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."contract_signatures" TO "anon";
GRANT ALL ON TABLE "public"."contract_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_allocations" TO "anon";
GRANT ALL ON TABLE "public"."delivery_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_corrections" TO "anon";
GRANT ALL ON TABLE "public"."delivery_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_issue_reports" TO "anon";
GRANT ALL ON TABLE "public"."delivery_issue_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_issue_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."e_receipt_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."e_receipt_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."e_receipt_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."e_receipts" TO "anon";
GRANT ALL ON TABLE "public"."e_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."e_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."file_uploads" TO "anon";
GRANT ALL ON TABLE "public"."file_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."file_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_batches" TO "anon";
GRANT ALL ON TABLE "public"."inventory_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_batches" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."laboratory_inspections" TO "anon";
GRANT ALL ON TABLE "public"."laboratory_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."laboratory_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."login_history" TO "anon";
GRANT ALL ON TABLE "public"."login_history" TO "authenticated";
GRANT ALL ON TABLE "public"."login_history" TO "service_role";



GRANT ALL ON TABLE "public"."message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset" TO "anon";
GRANT ALL ON TABLE "public"."password_reset" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset" TO "service_role";



GRANT ALL ON TABLE "public"."payment_details" TO "anon";
GRANT ALL ON TABLE "public"."payment_details" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_details" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pca_discount_table" TO "anon";
GRANT ALL ON TABLE "public"."pca_discount_table" TO "authenticated";
GRANT ALL ON TABLE "public"."pca_discount_table" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pca_discount_table_discount_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pca_discount_table_discount_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pca_discount_table_discount_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_forms" TO "anon";
GRANT ALL ON TABLE "public"."proposal_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_forms" TO "service_role";



GRANT ALL ON TABLE "public"."quality_results" TO "anon";
GRANT ALL ON TABLE "public"."quality_results" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_results" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_log" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rate_limit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rate_limit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rate_limit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roles_role_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_role_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_role_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."spot_price" TO "anon";
GRANT ALL ON TABLE "public"."spot_price" TO "authenticated";
GRANT ALL ON TABLE "public"."spot_price" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_performance_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."supplier_performance_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_performance_snapshot" TO "service_role";



GRANT ALL ON TABLE "public"."user_verify" TO "anon";
GRANT ALL ON TABLE "public"."user_verify" TO "authenticated";
GRANT ALL ON TABLE "public"."user_verify" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."walkin_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."walkin_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."walkin_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."weighing_records" TO "anon";
GRANT ALL ON TABLE "public"."weighing_records" TO "authenticated";
GRANT ALL ON TABLE "public"."weighing_records" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































