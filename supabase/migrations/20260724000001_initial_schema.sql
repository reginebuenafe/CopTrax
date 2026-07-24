-- ============================================================
-- Migration 001: Initial Schema
-- All enums and tables for CopTrax
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE public.account_status_enum AS ENUM ('Pending', 'Active', 'Rejected', 'Deleted');
CREATE TYPE public.verify_status_enum AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE public.login_status_enum AS ENUM ('Success', 'Failed');
CREATE TYPE public.file_category_enum AS ENUM ('Gov ID', 'Face ID', 'E-Sign', 'Contract Doc', 'Receipt', 'Bank QR', 'Other');
CREATE TYPE public.conversation_status_enum AS ENUM ('Open', 'Closed');
CREATE TYPE public.message_type_enum AS ENUM ('Text', 'Image', 'File', 'Contract Form');
CREATE TYPE public.proposal_status_enum AS ENUM ('Pending', 'Accepted', 'Rejected', 'Modified');
CREATE TYPE public.contract_status_enum AS ENUM ('Pending', 'Signed', 'Active', 'Completed', 'Breached');
CREATE TYPE public.signer_role_enum AS ENUM ('Supplier', 'Business Owner');
CREATE TYPE public.delivery_source_enum AS ENUM ('Walkin', 'Contract-based');
CREATE TYPE public.delivery_status_enum AS ENUM ('Pending', 'Weighed', 'Inspected', 'Accepted', 'Rejected');
CREATE TYPE public.quality_result_enum AS ENUM ('Accepted', 'Rejected');
CREATE TYPE public.payment_status_enum AS ENUM ('Pending', 'Released', 'Failed');
CREATE TYPE public.payment_method_enum AS ENUM ('Cash', 'Bank Transfer');
CREATE TYPE public.price_type_enum AS ENUM ('Negotiated', 'Spot');
CREATE TYPE public.inventory_source_type_enum AS ENUM ('Contractual', 'Walkin');
CREATE TYPE public.inventory_batch_status_enum AS ENUM ('Walk-in Holding', 'Ready to Merge', 'Resecada');
CREATE TYPE public.transaction_type_enum AS ENUM ('Stock In', 'Merge to Resecada', 'Stock Out', 'Adjustment');
CREATE TYPE public.review_decision_enum AS ENUM ('Approved', 'Held');
CREATE TYPE public.notification_type_enum AS ENUM (
  'Contract Signed', 'Contract Activated', 'Delivery Accepted', 'Delivery Rejected',
  'Weekly Payment Ready', 'Payment Released', 'Contract Completed', 'Contract Breached',
  'Deadline Reminder', 'Merge Pending', 'Merge Ready', 'Merge Completed', 'Other'
);

-- ============================================================
-- USER MANAGEMENT
-- ============================================================

CREATE TABLE public.roles (
    role_id   SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO public.roles (role_name) VALUES
    ('Business Owner'),
    ('Supplier'),
    ('Weigher'),
    ('Laboratory Staff');

-- public.users mirrors auth.users — one row per authenticated user
CREATE TABLE public.users (
    user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id        INTEGER REFERENCES public.roles(role_id),
    first_name     VARCHAR(100),
    last_name      VARCHAR(100),
    email          VARCHAR(255) NOT NULL,
    phone          VARCHAR(30),
    address        TEXT,
    account_status public.account_status_enum NOT NULL DEFAULT 'Pending',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by    UUID REFERENCES public.users(user_id),
    approved_at    TIMESTAMPTZ
);

CREATE TABLE public.file_uploads (
    file_id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uploaded_by   UUID REFERENCES public.users(user_id),
    file_category public.file_category_enum NOT NULL,
    file_name     VARCHAR(255),
    file_url      TEXT NOT NULL,
    file_size     BIGINT,
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_verify (
    verify_id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    gov_id_file_id UUID REFERENCES public.file_uploads(file_id),
    esign_file_id  UUID REFERENCES public.file_uploads(file_id),
    verify_status  public.verify_status_enum NOT NULL DEFAULT 'Pending',
    review_by      UUID REFERENCES public.users(user_id),
    reviewed_at    TIMESTAMPTZ
);

CREATE TABLE public.login_history (
    login_id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    login_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      INET,
    login_status    public.login_status_enum NOT NULL
);

CREATE TABLE public.password_reset (
    reset_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    reset_token  TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ
);

CREATE TABLE public.walkin_suppliers (
    walkin_supplier_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name         VARCHAR(100) NOT NULL,
    last_name          VARCHAR(100) NOT NULL,
    address            TEXT,
    phone              VARCHAR(30),
    recorded_by        UUID REFERENCES public.users(user_id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NEGOTIATION & CONTRACTS
-- ============================================================

-- contract_id FK is deferred — added after contracts table below
CREATE TABLE public.conversations (
    conversation_id   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_id       UUID NOT NULL REFERENCES public.users(user_id),
    business_owner_id UUID NOT NULL REFERENCES public.users(user_id),
    contract_id       UUID NULL,
    status            public.conversation_status_enum NOT NULL DEFAULT 'Open',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.messages (
    message_id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES public.conversations(conversation_id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES public.users(user_id),
    message_type    public.message_type_enum NOT NULL DEFAULT 'Text',
    message_text    TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.message_attachments (
    attachment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id    UUID NOT NULL REFERENCES public.messages(message_id) ON DELETE CASCADE,
    file_id       UUID NOT NULL REFERENCES public.file_uploads(file_id)
);

-- Self-referential: supersedes_proposal_id for counteroffer chains
CREATE TABLE public.proposal_forms (
    proposal_id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id        UUID NOT NULL REFERENCES public.conversations(conversation_id),
    supplier_id            UUID NOT NULL REFERENCES public.users(user_id),
    proposed_price_per_kg  DECIMAL(10,2) NOT NULL,
    proposed_volume_tons   DECIMAL(10,2) NOT NULL,
    proposal_status        public.proposal_status_enum NOT NULL DEFAULT 'Pending',
    submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by            UUID REFERENCES public.users(user_id),
    counter_price_per_kg   DECIMAL(10,2),
    supersedes_proposal_id UUID REFERENCES public.proposal_forms(proposal_id)
);

CREATE TABLE public.contracts (
    contract_id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_number         VARCHAR(50) NOT NULL UNIQUE,
    supplier_id             UUID NOT NULL REFERENCES public.users(user_id),
    business_owner_id       UUID NOT NULL REFERENCES public.users(user_id),
    negotiated_price_per_kg DECIMAL(10,2) NOT NULL,
    contracted_tons         DECIMAL(10,2) NOT NULL,
    signing_date            DATE,
    due_date                DATE NOT NULL,
    status                  public.contract_status_enum NOT NULL DEFAULT 'Pending',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now we can wire conversations → contracts
ALTER TABLE public.conversations
    ADD CONSTRAINT fk_conversations_contract
    FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id);

CREATE TABLE public.contract_signatures (
    signature_id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id        UUID NOT NULL REFERENCES public.contracts(contract_id) ON DELETE CASCADE,
    signer_id          UUID NOT NULL REFERENCES public.users(user_id),
    signer_role        public.signer_role_enum NOT NULL,
    esignature_file_id UUID REFERENCES public.file_uploads(file_id),
    signature_order    INTEGER NOT NULL,
    signed_at          TIMESTAMPTZ
);

-- ============================================================
-- DELIVERY & QUALITY
-- ============================================================

-- payment_id FK is deferred — added after payments table below
CREATE TABLE public.deliveries (
    delivery_id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_source    public.delivery_source_enum NOT NULL,
    contract_id        UUID REFERENCES public.contracts(contract_id),
    walkin_supplier_id UUID REFERENCES public.walkin_suppliers(walkin_supplier_id),
    batch_number       VARCHAR(50),
    delivery_date      DATE NOT NULL,
    truck_plate_number VARCHAR(20),
    weigher_id         UUID REFERENCES public.users(user_id),
    lab_staff_id       UUID REFERENCES public.users(user_id),
    delivery_status    public.delivery_status_enum NOT NULL DEFAULT 'Pending',
    payment_id         UUID NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.weighing_records (
    weighing_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_id     UUID NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
    weigher_id      UUID NOT NULL REFERENCES public.users(user_id),
    gross_weight_kg DECIMAL(12,3) NOT NULL,
    tare_weight_kg  DECIMAL(12,3) NOT NULL,
    net_weight_kg   DECIMAL(12,3) NOT NULL,
    weighed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.laboratory_inspections (
    inspection_id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_id          UUID NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
    lab_staff_id         UUID NOT NULL REFERENCES public.users(user_id),
    moisture_content_pct DECIMAL(5,2) NOT NULL,
    inspected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.quality_results (
    quality_id    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_id   UUID NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
    inspection_id UUID NOT NULL REFERENCES public.laboratory_inspections(inspection_id),
    result        public.quality_result_enum NOT NULL,
    remarks       TEXT,
    evaluated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE public.pca_discount_table (
    discount_id          SERIAL PRIMARY KEY,
    moisture_content_pct DECIMAL(4,1) NOT NULL UNIQUE,
    discount_value       DECIMAL(5,2) NOT NULL,
    table_version        VARCHAR(20) DEFAULT 'NEW PCA TABLE',
    effective_date       DATE DEFAULT CURRENT_DATE
);

-- Single current spot price — Business Owner overwrites manually, no history
CREATE TABLE public.spot_price (
    spot_price_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    price_per_kg  DECIMAL(10,2) NOT NULL,
    updated_by    UUID REFERENCES public.users(user_id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.payments (
    payment_id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_id       UUID NOT NULL REFERENCES public.users(user_id),
    business_owner_id UUID NOT NULL REFERENCES public.users(user_id),
    payment_date      DATE,
    payment_week      DATE NOT NULL,
    total_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
    payment_status    public.payment_status_enum NOT NULL DEFAULT 'Pending',
    reference_number  VARCHAR(100),
    payment_method    public.payment_method_enum NOT NULL DEFAULT 'Bank Transfer',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.payment_details (
    payment_detail_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_id            UUID NOT NULL REFERENCES public.payments(payment_id) ON DELETE CASCADE,
    delivery_id           UUID NOT NULL REFERENCES public.deliveries(delivery_id),
    gross_weight_kg       DECIMAL(12,3) NOT NULL,
    tare_weight_kg        DECIMAL(12,3) NOT NULL,
    net_weight_kg         DECIMAL(12,3) NOT NULL,
    moisture_content_pct  DECIMAL(5,2),
    moisture_deduction_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    final_weight_kg       DECIMAL(12,3) NOT NULL,
    price_type            public.price_type_enum NOT NULL,
    price_per_kg_used     DECIMAL(10,2) NOT NULL,
    pca_discount_id       INTEGER REFERENCES public.pca_discount_table(discount_id),
    pca_discount_amount   DECIMAL(12,3) NOT NULL DEFAULT 0,
    line_amount           DECIMAL(14,2) NOT NULL
);

CREATE TABLE public.e_receipts (
    receipt_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_id     UUID NOT NULL REFERENCES public.payments(payment_id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    file_id        UUID REFERENCES public.file_uploads(file_id),
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wire deliveries → payments now that payments table exists
ALTER TABLE public.deliveries
    ADD CONSTRAINT fk_delivery_payment
    FOREIGN KEY (payment_id) REFERENCES public.payments(payment_id);

-- ============================================================
-- INVENTORY
-- ============================================================

-- Self-referential: merged_into_batch_id for merge tracking
CREATE TABLE public.inventory_batches (
    inventory_batch_id   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_id          UUID NOT NULL REFERENCES public.deliveries(delivery_id),
    source_type          public.inventory_source_type_enum NOT NULL,
    batch_status         public.inventory_batch_status_enum NOT NULL DEFAULT 'Walk-in Holding',
    weight_kg            DECIMAL(12,3) NOT NULL,
    recorded_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    merge_eligible_date  DATE,
    reviewed_by_user_id  UUID REFERENCES public.users(user_id),
    reviewed_at          TIMESTAMPTZ,
    review_decision      public.review_decision_enum,
    merged_at            TIMESTAMPTZ,
    merged_into_batch_id UUID REFERENCES public.inventory_batches(inventory_batch_id)
);

CREATE TABLE public.inventory_transactions (
    transaction_id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_batch_id UUID NOT NULL REFERENCES public.inventory_batches(inventory_batch_id),
    transaction_type   public.transaction_type_enum NOT NULL,
    quantity_kg        DECIMAL(12,3) NOT NULL,
    transaction_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by       UUID REFERENCES public.users(user_id)
);

CREATE TABLE public.inventory_adjustments (
    adjustment_id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_batch_id UUID NOT NULL REFERENCES public.inventory_batches(inventory_batch_id),
    adjusted_by        UUID REFERENCES public.users(user_id),
    adjustment_reason  TEXT,
    old_weight_kg      DECIMAL(12,3) NOT NULL,
    new_weight_kg      DECIMAL(12,3) NOT NULL,
    adjusted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DASHBOARD, RATINGS, NOTIFICATIONS
-- ============================================================

CREATE TABLE public.supplier_performance_snapshot (
    snapshot_id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_id                UUID NOT NULL REFERENCES public.users(user_id),
    contract_id                UUID REFERENCES public.contracts(contract_id),
    snapshot_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    contract_fulfillment_score DECIMAL(5,2),
    delivered_volume_score     DECIMAL(5,2),
    copra_quality_score        DECIMAL(5,2),
    performance_score          DECIMAL(5,2),
    supplier_rating            INTEGER CHECK (supplier_rating BETWEEN 1 AND 5),
    overall_supplier_rating    DECIMAL(3,2)
);

CREATE TABLE public.notifications (
    notification_id   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    notification_type public.notification_type_enum NOT NULL,
    message           TEXT NOT NULL,
    related_entity_type VARCHAR(50),
    related_entity_id UUID,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
    audit_id    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES public.users(user_id),
    action      TEXT NOT NULL,
    entity_type VARCHAR(50),
    entity_id   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
