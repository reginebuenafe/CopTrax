-- ============================================================
-- Migration 003: Row Level Security (RLS) Policies
-- All business logic access control lives here — not in the frontend.
-- Service-role key (Edge Functions) bypasses RLS where needed.
-- ============================================================

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.roles                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_uploads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_verify                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walkin_suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_forms                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_signatures            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weighing_records               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laboratory_inspections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_results                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pca_discount_table             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spot_price                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_details                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e_receipts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_performance_snapshot  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ROLES (public read-only reference table)
-- ============================================================
CREATE POLICY "roles_select_all" ON public.roles
  FOR SELECT USING (true);

-- ============================================================
-- PCA_DISCOUNT_TABLE (public read-only reference table)
-- ============================================================
CREATE POLICY "pca_select_all" ON public.pca_discount_table
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- USERS
-- ============================================================
-- Every user can read and update their own row
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (user_id = auth.uid());

-- Business Owner can read and update all users (approval workflow)
CREATE POLICY "users_select_bo" ON public.users
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

CREATE POLICY "users_update_bo" ON public.users
  FOR UPDATE USING (public.get_my_role() = 'Business Owner');

-- Row is created by the auth trigger (security definer); direct client insert is blocked
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FILE_UPLOADS
-- ============================================================
CREATE POLICY "file_uploads_select" ON public.file_uploads
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR public.get_my_role() = 'Business Owner'
  );

CREATE POLICY "file_uploads_insert" ON public.file_uploads
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- ============================================================
-- USER_VERIFY
-- ============================================================
CREATE POLICY "user_verify_select_own" ON public.user_verify
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_verify_select_bo" ON public.user_verify
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

CREATE POLICY "user_verify_insert_own" ON public.user_verify
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_verify_update_bo" ON public.user_verify
  FOR UPDATE USING (public.get_my_role() = 'Business Owner');

-- ============================================================
-- LOGIN_HISTORY
-- ============================================================
CREATE POLICY "login_history_select_own" ON public.login_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "login_history_select_bo" ON public.login_history
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

CREATE POLICY "login_history_insert" ON public.login_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- PASSWORD_RESET
-- ============================================================
CREATE POLICY "password_reset_own" ON public.password_reset
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- WALKIN_SUPPLIERS
-- ============================================================
CREATE POLICY "walkin_suppliers_select" ON public.walkin_suppliers
  FOR SELECT USING (
    public.get_my_role() IN ('Business Owner', 'Weigher')
  );

CREATE POLICY "walkin_suppliers_insert" ON public.walkin_suppliers
  FOR INSERT WITH CHECK (public.get_my_role() = 'Weigher');

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT USING (
    supplier_id = auth.uid() OR business_owner_id = auth.uid()
  );

CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('Supplier', 'Business Owner')
  );

CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE USING (
    supplier_id = auth.uid() OR business_owner_id = auth.uid()
  );

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.conversation_id = messages.conversation_id
        AND (c.supplier_id = auth.uid() OR c.business_owner_id = auth.uid())
    )
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.conversation_id = messages.conversation_id
        AND (c.supplier_id = auth.uid() OR c.business_owner_id = auth.uid())
    )
  );

-- ============================================================
-- MESSAGE_ATTACHMENTS
-- ============================================================
CREATE POLICY "message_attachments_select" ON public.message_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.conversation_id = m.conversation_id
      WHERE m.message_id = message_attachments.message_id
        AND (c.supplier_id = auth.uid() OR c.business_owner_id = auth.uid())
    )
  );

CREATE POLICY "message_attachments_insert" ON public.message_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.message_id = message_attachments.message_id
        AND m.sender_id = auth.uid()
    )
  );

-- ============================================================
-- PROPOSAL_FORMS
-- ============================================================
CREATE POLICY "proposals_select" ON public.proposal_forms
  FOR SELECT USING (
    supplier_id = auth.uid()
    OR public.get_my_role() = 'Business Owner'
  );

CREATE POLICY "proposals_insert" ON public.proposal_forms
  FOR INSERT WITH CHECK (
    (public.get_my_role() = 'Supplier' AND supplier_id = auth.uid())
    OR public.get_my_role() = 'Business Owner'
  );

CREATE POLICY "proposals_update" ON public.proposal_forms
  FOR UPDATE USING (
    public.get_my_role() = 'Business Owner'
    OR (public.get_my_role() = 'Supplier' AND supplier_id = auth.uid())
  );

-- ============================================================
-- CONTRACTS
-- ============================================================
CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    supplier_id = auth.uid() OR business_owner_id = auth.uid()
  );

CREATE POLICY "contracts_insert_bo" ON public.contracts
  FOR INSERT WITH CHECK (public.get_my_role() = 'Business Owner');

CREATE POLICY "contracts_update_bo" ON public.contracts
  FOR UPDATE USING (public.get_my_role() = 'Business Owner');

-- ============================================================
-- CONTRACT_SIGNATURES
-- ============================================================
CREATE POLICY "contract_signatures_select" ON public.contract_signatures
  FOR SELECT USING (
    signer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.contract_id = contract_signatures.contract_id
        AND (c.supplier_id = auth.uid() OR c.business_owner_id = auth.uid())
    )
  );

CREATE POLICY "contract_signatures_insert" ON public.contract_signatures
  FOR INSERT WITH CHECK (signer_id = auth.uid());

-- ============================================================
-- DELIVERIES
-- ============================================================
CREATE POLICY "deliveries_select" ON public.deliveries
  FOR SELECT USING (
    public.get_my_role() IN ('Business Owner', 'Weigher', 'Laboratory Staff')
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.contract_id = deliveries.contract_id
        AND c.supplier_id = auth.uid()
    )
  );

CREATE POLICY "deliveries_insert" ON public.deliveries
  FOR INSERT WITH CHECK (public.get_my_role() = 'Weigher');

CREATE POLICY "deliveries_update" ON public.deliveries
  FOR UPDATE USING (
    public.get_my_role() IN ('Business Owner', 'Weigher', 'Laboratory Staff')
  );

-- ============================================================
-- WEIGHING_RECORDS
-- ============================================================
CREATE POLICY "weighing_records_select" ON public.weighing_records
  FOR SELECT USING (
    weigher_id = auth.uid()
    OR public.get_my_role() IN ('Business Owner', 'Laboratory Staff')
  );

CREATE POLICY "weighing_records_insert" ON public.weighing_records
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'Weigher' AND weigher_id = auth.uid()
  );

-- ============================================================
-- LABORATORY_INSPECTIONS
-- ============================================================
CREATE POLICY "lab_inspections_select" ON public.laboratory_inspections
  FOR SELECT USING (
    public.get_my_role() IN ('Business Owner', 'Laboratory Staff')
    OR lab_staff_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.contracts c ON c.contract_id = d.contract_id
      WHERE d.delivery_id = laboratory_inspections.delivery_id
        AND c.supplier_id = auth.uid()
    )
  );

CREATE POLICY "lab_inspections_insert" ON public.laboratory_inspections
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'Laboratory Staff' AND lab_staff_id = auth.uid()
  );

-- ============================================================
-- QUALITY_RESULTS
-- ============================================================
CREATE POLICY "quality_results_select" ON public.quality_results
  FOR SELECT USING (
    public.get_my_role() IN ('Business Owner', 'Laboratory Staff')
    OR EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.contracts c ON c.contract_id = d.contract_id
      WHERE d.delivery_id = quality_results.delivery_id
        AND c.supplier_id = auth.uid()
    )
  );

CREATE POLICY "quality_results_insert" ON public.quality_results
  FOR INSERT WITH CHECK (public.get_my_role() = 'Laboratory Staff');

-- ============================================================
-- SPOT_PRICE
-- ============================================================
-- All authenticated users can see the current spot price (shown on dashboards)
CREATE POLICY "spot_price_select" ON public.spot_price
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "spot_price_insert_bo" ON public.spot_price
  FOR INSERT WITH CHECK (public.get_my_role() = 'Business Owner');

CREATE POLICY "spot_price_update_bo" ON public.spot_price
  FOR UPDATE USING (public.get_my_role() = 'Business Owner');

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    supplier_id = auth.uid()
    OR public.get_my_role() = 'Business Owner'
  );

CREATE POLICY "payments_insert_bo" ON public.payments
  FOR INSERT WITH CHECK (public.get_my_role() = 'Business Owner');

CREATE POLICY "payments_update_bo" ON public.payments
  FOR UPDATE USING (public.get_my_role() = 'Business Owner');

-- ============================================================
-- PAYMENT_DETAILS
-- ============================================================
CREATE POLICY "payment_details_select" ON public.payment_details
  FOR SELECT USING (
    public.get_my_role() = 'Business Owner'
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.payment_id = payment_details.payment_id
        AND p.supplier_id = auth.uid()
    )
  );

CREATE POLICY "payment_details_insert_bo" ON public.payment_details
  FOR INSERT WITH CHECK (public.get_my_role() = 'Business Owner');

-- ============================================================
-- E_RECEIPTS
-- ============================================================
CREATE POLICY "e_receipts_select" ON public.e_receipts
  FOR SELECT USING (
    public.get_my_role() = 'Business Owner'
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.payment_id = e_receipts.payment_id
        AND p.supplier_id = auth.uid()
    )
  );

CREATE POLICY "e_receipts_insert_bo" ON public.e_receipts
  FOR INSERT WITH CHECK (public.get_my_role() = 'Business Owner');

-- ============================================================
-- INVENTORY_BATCHES
-- ============================================================
CREATE POLICY "inventory_batches_select" ON public.inventory_batches
  FOR SELECT USING (
    public.get_my_role() IN ('Business Owner', 'Weigher')
  );

CREATE POLICY "inventory_batches_insert" ON public.inventory_batches
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('Business Owner', 'Weigher')
  );

CREATE POLICY "inventory_batches_update_bo" ON public.inventory_batches
  FOR UPDATE USING (public.get_my_role() = 'Business Owner');

-- ============================================================
-- INVENTORY_TRANSACTIONS
-- ============================================================
CREATE POLICY "inventory_transactions_select" ON public.inventory_transactions
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('Business Owner', 'Weigher')
  );

-- ============================================================
-- INVENTORY_ADJUSTMENTS
-- ============================================================
CREATE POLICY "inventory_adjustments_select" ON public.inventory_adjustments
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

CREATE POLICY "inventory_adjustments_insert_bo" ON public.inventory_adjustments
  FOR INSERT WITH CHECK (public.get_my_role() = 'Business Owner');

-- ============================================================
-- SUPPLIER_PERFORMANCE_SNAPSHOT
-- ============================================================
CREATE POLICY "perf_snapshot_select" ON public.supplier_performance_snapshot
  FOR SELECT USING (
    supplier_id = auth.uid()
    OR public.get_my_role() = 'Business Owner'
  );

-- Inserted by Edge Functions / triggers using service role — no direct client insert

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- User can mark their own notifications as read
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
CREATE POLICY "audit_logs_select_bo" ON public.audit_logs
  FOR SELECT USING (public.get_my_role() = 'Business Owner');

-- Audit log rows are inserted by Edge Functions using service role key
