-- ============================================================
-- Migration 009: Delivery Allocations
-- Supports the multi-contract cascade delivery model:
--   A single delivery can be split across N Active contracts
--   (earliest due-date first), with any remainder priced at Spot.
-- ============================================================

-- 1. Add supplier_id to deliveries for direct supplier lookup
--    (contractual deliveries may now span multiple contracts,
--     so contract_id alone is insufficient to identify the supplier)
ALTER TABLE public.deliveries
    ADD COLUMN supplier_id UUID REFERENCES public.users(user_id);

-- 2. delivery_allocations: one row per contract (or spot) per delivery
CREATE TABLE public.delivery_allocations (
    allocation_id       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_id         UUID        NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
    contract_id         UUID        REFERENCES public.contracts(contract_id), -- NULL = spot-price portion
    allocated_weight_kg DECIMAL(12,3) NOT NULL,
    price_type          public.price_type_enum NOT NULL DEFAULT 'Negotiated',
    sequence_order      INTEGER     NOT NULL DEFAULT 1
);

-- 3. Backfill supplier_id from the existing contract FK
UPDATE public.deliveries d
SET supplier_id = c.supplier_id
FROM public.contracts c
WHERE d.contract_id = c.contract_id
  AND d.delivery_source = 'Contract-based';

-- 4. Backfill delivery_allocations for all existing Contract-based deliveries
--    price_type: 'Spot' if delivery_date > contract.due_date, else 'Negotiated'
INSERT INTO public.delivery_allocations
    (delivery_id, contract_id, allocated_weight_kg, price_type, sequence_order)
SELECT
    d.delivery_id,
    d.contract_id,
    wr.net_weight_kg,
    CASE
        WHEN d.delivery_date > c.due_date THEN 'Spot'::public.price_type_enum
        ELSE 'Negotiated'::public.price_type_enum
    END,
    1
FROM public.deliveries d
JOIN public.weighing_records wr ON wr.delivery_id = d.delivery_id
JOIN public.contracts         c  ON c.contract_id  = d.contract_id
WHERE d.delivery_source = 'Contract-based'
  AND d.contract_id IS NOT NULL;

-- ============================================================
-- 5. Trigger: auto-complete contracts when accepted deliveries
--    fill the contracted quantity
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_contract_completion_on_acceptance()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_check_contract_completion
    AFTER UPDATE ON public.deliveries
    FOR EACH ROW
    EXECUTE FUNCTION public.check_contract_completion_on_acceptance();

-- ============================================================
-- 6. RLS for delivery_allocations
-- ============================================================

ALTER TABLE public.delivery_allocations ENABLE ROW LEVEL SECURITY;

-- Business Owner: read all
CREATE POLICY delivery_allocations_select_bo ON public.delivery_allocations
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'Business Owner');

-- Supplier: read allocations that belong to their contracts (or spot rows on their deliveries)
CREATE POLICY delivery_allocations_select_supplier ON public.delivery_allocations
    FOR SELECT TO authenticated
    USING (
        public.get_my_role() = 'Supplier'
        AND EXISTS (
            SELECT 1 FROM public.deliveries d
            WHERE d.delivery_id = delivery_allocations.delivery_id
              AND d.supplier_id = auth.uid()
        )
    );

-- Weigher: read all + insert (they create allocations when recording a delivery)
CREATE POLICY delivery_allocations_select_weigher ON public.delivery_allocations
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'Weigher');

CREATE POLICY delivery_allocations_insert_weigher ON public.delivery_allocations
    FOR INSERT TO authenticated
    WITH CHECK (public.get_my_role() = 'Weigher');

-- Laboratory Staff: read all (needs allocation context during inspection)
CREATE POLICY delivery_allocations_select_lab ON public.delivery_allocations
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'Laboratory Staff');
