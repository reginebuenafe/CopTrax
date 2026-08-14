-- Fix all foreign keys referencing public.users(user_id) to have proper
-- ON DELETE behavior so deleting a user cascades cleanly.
--
-- Uses a defensive DO block: skips tables/columns that don't exist and
-- looks up actual constraint names instead of guessing.

DO $$
DECLARE
  fks TEXT[][] := ARRAY[
    ['file_uploads','approved_by','SET NULL'],
    ['file_uploads','uploaded_by','SET NULL'],
    ['user_verify','review_by','SET NULL'],
    ['user_verify','reviewed_by','SET NULL'],
    ['walkin_suppliers','recorded_by','SET NULL'],
    ['conversations','supplier_id','CASCADE'],
    ['conversations','business_owner_id','CASCADE'],
    ['messages','sender_id','CASCADE'],
    ['proposal_forms','supplier_id','CASCADE'],
    ['proposal_forms','business_owner_id','CASCADE'],
    ['proposal_forms','reviewed_by','SET NULL'],
    ['contracts','supplier_id','CASCADE'],
    ['contracts','business_owner_id','CASCADE'],
    ['contract_signatures','signer_id','CASCADE'],
    ['deliveries','weigher_id','SET NULL'],
    ['deliveries','lab_staff_id','SET NULL'],
    ['weighing_records','weigher_id','CASCADE'],
    ['laboratory_inspections','lab_staff_id','CASCADE'],
    ['spot_price','updated_by','SET NULL'],
    ['payments','supplier_id','CASCADE'],
    ['payments','business_owner_id','CASCADE'],
    ['inventory_batches','supplier_id','CASCADE'],
    ['inventory_batches','business_owner_id','CASCADE'],
    ['inventory_batches','reviewed_by_user_id','SET NULL'],
    ['inventory_transactions','performed_by','SET NULL'],
    ['inventory_adjustments','adjusted_by','SET NULL'],
    ['supplier_performance_snapshot','supplier_id','CASCADE'],
    ['notifications','user_id','CASCADE'],
    ['audit_logs','user_id','SET NULL']
  ];
  i INT;
  tbl TEXT;
  col TEXT;
  act TEXT;
  con_name TEXT;
BEGIN
  FOR i IN 1..array_length(fks, 1) LOOP
    tbl := fks[i][1];
    col := fks[i][2];
    act := fks[i][3];

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name=col
    ) THEN
      RAISE NOTICE 'Skipping %.% (column not found)', tbl, col;
      CONTINUE;
    END IF;

    FOR con_name IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema   = kcu.table_schema
      WHERE tc.table_schema='public'
        AND tc.table_name = tbl
        AND tc.constraint_type='FOREIGN KEY'
        AND kcu.column_name = col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, con_name);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(user_id) ON DELETE %s',
      tbl, tbl || '_' || col || '_fkey', col, act
    );
  END LOOP;
END $$;
