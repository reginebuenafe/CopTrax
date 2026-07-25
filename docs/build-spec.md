# CopTrax — Build Specification

> Aligned with **SRS v1.0 (July 22, 2026)** — Sections 4.1–4.7 (System Features, Stimulus/Response, Functional Requirements) and Section 5.5 (Business Rules). REQ-4.x IDs are referenced throughout for traceability back to the SRS. This revision supersedes the earlier draft of this spec: the delivery/contract allocation model in §3.3 changed materially against the revised SRS text (see "What changed from the previous build-spec" below). A few extensions beyond the base SRS (moisture discount table, inventory Walk-in→Resecada merge review) were added through direct clarification with the business owner and are explicitly marked **[Extension]** below — they don't contradict the SRS, they fill in detail it left open. **Spot Price is no longer an extension** — SRS §4.7 (REQ-4.7-2, 4.7-3, 4.7-5, 4.7-6) makes it a first-class, Business-Owner-editable dashboard feature. Academic sections (bibliography, legal/regulatory boilerplate, testing methodology, project management/Gantt chart) are intentionally excluded as non-actionable for development.

## What changed from the previous build-spec (read this before building §3.3/§3.5/§4)

The earlier draft of this spec invented a **"Non-Contract Delivery"** concept, triggered when a Weigher recorded a delivery against a contract that was already `Completed`/`Breached`. The revised SRS text (REQ-4.3-9, REQ-4.3-10, REQ-4.4-2 through REQ-4.4-6, REQ-4.4-9) describes a **different and more specific mechanism**, which this document now builds to instead:

1. **No manual contract selection.** The Weigher does not pick "Walk-in vs Contractual" and then choose a specific contract. For a contractual Supplier, the Weigher just searches for the Supplier (REQ-4.4-2); the system automatically retrieves and allocates against **that Supplier's eligible Active contract with the earliest delivery deadline** (REQ-4.4-3, REQ-4.4-4) — no dropdown of contracts, no manual pick.
2. **Overflow cascades to the next contract, not to a Non-Contract bucket.** If a delivery's quantity exceeds the remaining quantity on the currently allocated Active contract, the excess is **automatically allocated to the Supplier's next eligible Active contract**, again by earliest deadline (REQ-4.3-9, REQ-4.4-5) — and this can repeat across more than one contract for a single delivery.
3. **Spot Price is the fallback only when no eligible Active contract remains** — not when a specific contract is Completed/Breached (REQ-4.3-10, REQ-4.4-6). A Supplier with zero Active contracts, or whose Active contracts are all fully allocated, has their delivery (or delivery remainder) priced at Spot Price.
4. **A single delivery can therefore span multiple contracts, plus a Spot Price remainder** — REQ-4.4-9 explicitly says the system updates records "for each affected Active contract" (plural). This is a materially different data model from a single `contract_id` per delivery — see the new `DELIVERY_ALLOCATIONS` table in §4.
5. **Payment stays one transaction per delivery** (REQ-4.5-2 is unchanged), but the payable amount for a delivery with mixed allocations is the **sum of its per-allocation line amounts** — some at negotiated contract price, some at spot price, within the same delivery. See the revised §3.5.

If you're picking this project back up mid-build and code already exists for the old "Non-Contract Delivery" model, treat it as needing a rewrite of the delivery-allocation and payment-computation logic — don't just patch around it.

---

## 1. Project Overview

CopTrax is a web-based procurement management system for **NERC Copra Trading**. It digitizes the flow of buying copra (dried coconut kernel) from suppliers: registration/verification → price negotiation → contract → delivery → weighing → quality testing → payment → inventory → performance rating → reporting.

**Stack**
- Frontend: React.js, deployed on Render (Static Site)
- Backend: Supabase — Postgres database, Supabase Auth, Edge Functions (Deno/TypeScript) for custom business logic, Scheduled Functions/pg_cron for time-based checks (contract deadline, inventory merge eligibility)
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth; role stored on the user's profile row, enforced via Row Level Security (RLS) policies rather than custom middleware. Issues a JWT per session (REQ-4.1-15).
- Payments: Xendit (payment gateway) — per-delivery disbursement (REQ-4.5-5)
- PDF generation: jsPDF (+ html2canvas for e-receipts); also used for report export (REQ-4.7-7)
- Report export: PDF and Microsoft Excel (.xlsx) — REQ-4.7-7
- Deployment: Render (frontend static site) + Supabase (database, auth, functions) — no separate backend server to host

---

## 2. User Roles

| Role | Account Creation | Core Purpose |
|---|---|---|
| **Business Owner** | Seeded manually (not self-registered) | Admin. Approves Supplier registrations, negotiates & sends contracts, records reports/analytics, processes payments, reviews inventory merges **[Extension]**, creates Weigher/Lab Staff accounts |
| **Supplier** | Self-registers, requires government ID + e-signature upload, account starts `Pending Verification` until Business Owner approves | Negotiates price via chat, signs contracts, tracks deliveries/payments/rating |
| **Weigher** | Created directly by the Business Owner (no self-registration, no approval step — active immediately) | Records deliveries (Walk-in or Contractual) at intake |
| **Laboratory Staff** | Created directly by the Business Owner (no self-registration, no approval step — active immediately) | Records moisture content / quality assessment per delivery |

All four roles have login. **Only Suppliers self-register.** Business Owner, Weigher, and Laboratory Staff accounts are all created by the Business Owner (the Business Owner's own account is pre-seeded in the database; Weigher/Lab Staff accounts are created by the Business Owner from within the app — REQ-4.1-2, REQ-4.1-17, REQ-4.1-18).

---

## 3. Core Workflows

### 3.0 Account Registration & Verification (SRS §4.1)

**Supplier (self-registration):**
1. Supplier fills out: first name, last name, email, contact number, password (REQ-4.1-3).
2. Uploads a government-issued ID and an electronic signature (REQ-4.1-4, REQ-4.1-5) — stored via `FILE_UPLOADS`, linked through `USER_VERIFY`. The e-signature is reused automatically on future contracts.
3. System checks email uniqueness (REQ-4.1-6) → creates account with `account_status = 'Pending Verification'` (REQ-4.1-7).
4. Supplier sees a notification that their registration is pending Business Owner approval (REQ-4.1-8); cannot access the dashboard or protected features until approved (REQ-4.1-9).
5. Business Owner reviews the registration details, government ID, and e-signature (REQ-4.1-10) → Approves or Rejects (REQ-4.1-11).
6. Supplier receives an email: approved (`account_status = 'Active'`, can now log in — REQ-4.1-12) or rejected (REQ-4.1-13).

**Weigher / Laboratory Staff (Business Owner-created):**
1. Business Owner creates the account directly from within the app, assigning the correct role (REQ-4.1-2, REQ-4.1-17, REQ-4.1-18).
2. Account is `Active` immediately — no self-registration, no pending/approval step.

**Login & session:**
- Authenticate via email + password (REQ-4.1-14) → issues a JWT (REQ-4.1-15) via Supabase Auth.
- Role-based access enforced for all four roles (REQ-4.1-16) via Row Level Security policies.
- Invalid/expired sessions auto-terminate (REQ-4.1-23); users can log out (REQ-4.1-24).

**Profile management:**
- Users can update email, contact number, and address (REQ-4.1-19).
- First and last name are locked after account creation (REQ-4.1-20).
- Users can change their password (REQ-4.1-21) and use password recovery if locked out (REQ-4.1-22).

### 3.1 Price Negotiation & Contract Agreement (SRS §4.2)
1. Approved Supplier initiates negotiation via the chat's **"Propose Price"** action — submits a structured proposal (price per ton, quantity) (REQ-4.2-2). Displayed as a proposal card in the chat (REQ-4.2-3); Business Owner is notified (REQ-4.2-4).
2. Business Owner can **Accept**, **Reject**, or **Counteroffer** (modifying price/quantity/remarks) (REQ-4.2-5, REQ-4.2-6). Supplier is notified of the action (REQ-4.2-7).
3. **Reject ends the negotiation entirely** — no further action possible on that thread (matches SRS: "marks the negotiation as rejected and ends the negotiation process").
4. **Counteroffer loops**: the other party can Accept, Reject, or Counteroffer again — proposal card always shows the latest values (REQ-4.2-8, REQ-4.2-9). This can go back and forth until one side Accepts (ends in a contract) or Rejects (ends the negotiation).
5. Once both parties agree, the system records the finalized terms (REQ-4.2-10). **A contract cannot be generated until agreement is reached** (REQ-4.2-11).
6. Business Owner generates the contract — auto-populated with Supplier info, agreed price/ton, quantity, and total amount (REQ-4.2-12), completes remaining details, and sends it (REQ-4.2-13). Supplier is notified (REQ-4.2-14).
7. Supplier reviews the contract (REQ-4.2-15) and affixes their pre-uploaded e-signature (REQ-4.2-16).
8. On successful signature, contract becomes **Active**; Business Owner is notified (REQ-4.2-17).
9. Free-text messaging is available throughout (REQ-4.2-18); conversation history is retained until the negotiation completes or terminates (REQ-4.2-19); negotiation status (Pending/Accepted/Rejected) is always visible (REQ-4.2-20); all parties get notified on new messages/proposals/counteroffers (REQ-4.2-21), each timestamped (REQ-4.2-22).

**Business Rule:** the contract's delivery deadline is **automatically set to one month and one day from the contract's activation date** — not manually negotiated (SRS Business Rule #7).

### 3.2 Contract Management (SRS §4.3)
1. Supplier and Business Owner can view active contract details: status, agreed/delivered/remaining quantity, activation date, delivery deadline (REQ-4.3-1, REQ-4.3-2).
2. Each recorded delivery under a contract auto-updates delivered quantity and recalculates remaining quantity (REQ-4.3-3, REQ-4.3-4, REQ-4.3-5).
3. Contract auto-marked **Completed** once the agreed quantity is fully delivered (REQ-4.3-7).
4. Contract auto-marked **Breached** once the delivery deadline elapses before the agreed quantity is fulfilled (REQ-4.3-8).
5. **Only Active contracts accept delivery transactions.** A delivery's quantity is allocated automatically — first to the Supplier's Active contract with the earliest deadline, cascading to the next eligible Active contract if it overflows, and finally to Spot Price if no eligible Active contract remains; see §3.3 (REQ-4.3-9, REQ-4.3-10).
6. Fulfillment percentage (delivered ÷ agreed quantity) is always visible for Active contracts; it stops updating once a contract is Completed or Breached (REQ-4.3-11, REQ-4.3-12).
7. Both parties are notified when a contract becomes Completed or Breached (REQ-4.3-13).

### 3.3 Weigher flow — Delivery & Inventory (SRS §4.4)

On login, the Weigher records deliveries from **contractual Suppliers** and **walk-in Suppliers** (REQ-4.4-1). There is no dropdown of contracts to choose from — the system does the contract selection automatically.

**Contractual Supplier delivery:**
1. Weigher searches for and selects the (approved, registered) Supplier — not a contract (REQ-4.4-2).
2. Weigher enters gross/tare/net weight.
3. System automatically retrieves that Supplier's **eligible Active contract with the earliest delivery deadline** and allocates the delivery to it — no manual contract selection (REQ-4.4-3, REQ-4.4-4).
4. **Overflow cascade**: if the delivered quantity exceeds the remaining quantity on that contract, the excess is automatically allocated to the Supplier's **next** eligible Active contract, again by earliest deadline (REQ-4.3-9, REQ-4.4-5). This can repeat across more than one Active contract for a single delivery — see `DELIVERY_ALLOCATIONS` in §4.
5. **Spot Price fallback**: once no eligible Active contract remains for the Supplier (zero Active contracts, or all of them fully allocated by this delivery), any remaining un-allocated quantity is processed at the current Spot Price (REQ-4.3-10, REQ-4.4-6). This portion is *not* linked to any specific contract and does not affect any contract's fulfillment.
6. Each affected Active contract has its delivered quantity, remaining quantity, fulfillment progress, and inventory updated immediately (REQ-4.4-9, REQ-5.1-4).

**Walk-in Supplier delivery:**
1. Weigher enters walk-in supplier name, address, delivery date, and weight (REQ-4.4-7).
2. Recorded independently of any procurement contract (REQ-4.4-11), updates inventory only (REQ-4.4-10), settled in cash outside the system.

Either path creates a `DELIVERIES` row (with one or more `DELIVERY_ALLOCATIONS` rows for contractual deliveries) plus a `WEIGHING_RECORDS` row; status becomes `Weighed`, awaiting lab inspection.

7. Laboratory Staff submits quality assessment; it's associated with the corresponding delivery (REQ-4.4-8) — one moisture-content reading per delivery, applied against every allocation on that delivery.
8. Business Owner can view all delivery records — contractual and walk-in, with their contract allocations where applicable (REQ-4.4-10 range). Suppliers see only deliveries tied to their own contracts (REQ-4.4-11 range).
9. Walk-in deliveries are excluded from contract fulfillment, Supplier ratings, and electronic payment (REQ-4.4-12) — settled in cash. A contractual delivery's Spot-Price-priced remainder (from the cascade above) *is* still paid electronically, just not counted toward any contract's fulfillment or that Supplier's rating.

### 3.4 Laboratory Staff flow — Quality Assessment
1. Selects a `Weighed` delivery.
2. Enters moisture content % (`LABORATORY_INSPECTIONS`).
3. System looks up the discount tied to that moisture % **[Extension]**, produces `QUALITY_RESULTS` (`Accepted` / `Rejected`).
4. Delivery status becomes `Inspected` → `Accepted` or `Rejected`.

**Moisture discount rule [Extension]** (table only covers 5.0%–20.2% moisture content, seeded from `seed/pca_discount_table.sql` — NERC Copra Trading's official PCA reference table):
```
IF moisture_content_pct < 5.0:
    discount_value = 0.0        -- treated as best quality, same as 6.0% (baseline)
    result = Accepted

ELSE IF moisture_content_pct > 20.2:
    result = Rejected            -- automatic, no payment computed for this delivery
    discount_value = N/A

ELSE:
    discount_value = PCA_DISCOUNT_TABLE lookup WHERE moisture_content_pct = rounded value (nearest 0.1)
    result = Accepted
```
The table is a literal lookup, not a formula — discount rate varies slightly between moisture bands, so values must never be recalculated or interpolated.

### 3.5 Payment Management (SRS §4.5)
1. Business Owner views contractual-Supplier deliveries eligible for payment (REQ-4.5-1) — **each validated delivery is its own separate payment transaction** (REQ-4.5-2), not batched, regardless of how many contracts (or Spot Price) it was allocated across.
2. System auto-computes the payable amount for a delivery as the **sum of its per-allocation line amounts** (REQ-4.5-3, "based on the applicable contract price and validated delivery information"). A delivery has one allocation row per contract it touched, plus at most one Spot Price allocation row for any un-allocated remainder (see `DELIVERY_ALLOCATIONS`, §4, and §3.3's cascade rule):
   ```
   -- One moisture reading applies to the whole delivery (§3.4). The discount
   -- deduction is applied to the delivery's final weight, then that final
   -- weight is split across allocations in the same proportions the raw
   -- weight was split (§3.3's cascade), each priced by its own allocation:

   deduction_pct = discount_value_from_lookup(moisture_content_pct)   -- [Extension], §3.4
   final_weight_kg = net_weight_kg × (1 − deduction_pct / 100)

   FOR EACH allocation on this delivery (ordered as allocated):
       allocation_final_weight_kg = final_weight_kg × (allocation.allocated_weight_kg / net_weight_kg)

       IF allocation.contract_id IS NOT NULL:
           price_per_kg = contract.negotiated_price_per_ton / 1000   -- contracts are negotiated per ton (SRS §4.2); convert to kg
           price_type = 'Negotiated'
       ELSE:  -- no eligible Active contract remained for this portion
           price_per_kg = SPOT_PRICE.price_per_kg   -- current value at computation time
           price_type = 'Spot'

       allocation.line_amount = allocation_final_weight_kg × price_per_kg

   payable_amount = SUM(allocation.line_amount)  -- this is the single payment transaction's amount
   ```
3. Business Owner reviews the payment details of an individual delivery — including its per-allocation breakdown, if it spans more than one contract and/or Spot Price — before initiating payment (REQ-4.5-4).
4. Business Owner initiates a separate electronic disbursement per delivery through Xendit (REQ-4.5-5). The system prevents a delivery from being paid twice (REQ-4.5-6).
5. On gateway response, payment status updates accordingly (REQ-4.5-7); failed payments keep the delivery `Unpaid`, retrying later (REQ-4.5-8).
6. A successful payment generates its own e-receipt (REQ-4.5-9), linked to that delivery and transaction — itemized by allocation if the delivery spanned more than one (REQ-4.5-10).
7. Suppliers can view payment status and e-receipts for their own deliveries (REQ-4.5-11).
8. Walk-in deliveries are entirely excluded from this feature (REQ-4.5-12) — cash, off-system. Any Spot-Price-priced allocation on a contractual delivery **is** included (per the cascade rule in §3.3/§3.5 above).

**Spot Price (SRS §4.7, REQ-4.7-2, 4.7-3, 4.7-5, 4.7-6)** is a single current value only the Business Owner can update, via a **Spot Price Editor** on their dashboard — not tied to a specific date, no history needed. It always holds whatever was last set; any allocation priced at Spot reads its current value at computation time. Updating it immediately applies to all subsequent Spot-priced transactions system-wide (REQ-4.7-6). Displayed as "Current Spot Price (Price of the Day)" on both the Business Owner and Supplier dashboards.

### 3.6 Inventory — Walk-in Holding & Resecada Merge [Extension]
- **Contractual accepted deliveries** go straight into the main **Resecada** inventory pool — regardless of whether they were priced at Negotiated contract price, Spot Price, or a mix of both across their `DELIVERY_ALLOCATIONS` (§3.3).
- **Walk-in deliveries** (generally lower quality) enter a separate **Walk-in Holding** pool, kept apart from Resecada.
- Each walk-in batch has a `merge_eligible_date` = `recorded_date + 14 calendar days`.
- **On record**: notify Business Owner — "[X] kg walk-in copra recorded on [date], eligible to merge into Resecada on [merge_eligible_date]."
- **On the eligible date**: batch status changes to `Ready to Merge`; notify Business Owner — "[X] kg walk-in copra is ready to merge into Resecada. Review and approve."
- **Merge is NOT automatic.** Business Owner reviews the "Ready to Merge" queue and either:
  - **Approves** → batch status becomes `Resecada`, weight added to the pool, `Merge to Resecada` transaction logged, "Merge Completed" notification sent.
  - **Holds** → batch stays in `Ready to Merge` until the Business Owner acts later (no forced timeout).

### 3.7 Supplier Performance Rating (SRS §4.6)
Computed automatically when a contract is marked `Completed` or `Breached` (REQ-4.6-1), evaluating three criteria (REQ-4.6-2):

| Criterion | Weight | Scoring |
|---|---|---|
| Contract Fulfillment | 60% | 100% if fulfilled on/before deadline, 0% if breached (REQ-4.6-3) |
| Delivered Volume | 20% | 50+ tons=100%, 40–49.99=80%, 30–39.99=60%, 20–29.99=40%, ≤10=20% (REQ-4.6-4) |
| Copra Quality (Moisture) | 20% | 6.5–7.4%=100%, 7.5–8.4%=80%, 8.5–9.4%=60%, 9.5–10.4%=40%, 10.5–20.2%=20%, >20.2%=Rejected (0%) (REQ-4.6-5) |

`Performance Score = (Fulfillment×0.6) + (Volume×0.2) + (Quality×0.2)` (REQ-4.6-6)

Convert to 1–5 rating (REQ-4.6-7): 90–100%→5, 70–89%→4, 50–69%→3, 30–49%→2, 0–29%→1

Rating is associated with its originating contract (REQ-4.6-8). `Overall Supplier Rating = average of all per-contract ratings for that supplier's completed/breached contracts` (REQ-4.6-9), auto-recalculated on every new rating (REQ-4.6-10), used to rank suppliers (REQ-4.6-11). Both Business Owner and the Supplier can view Overall + individual ratings (REQ-4.6-12, REQ-4.6-13). **Walk-in suppliers are excluded entirely** — they don't have contracts (REQ-4.6-14). A delivery's Spot-Price allocation (§3.3/§3.5 — the portion with no eligible Active contract) similarly doesn't feed into any contract's rating, since it isn't associated with one.

### 3.8 Dashboard & Reporting (SRS §4.7)
Role-appropriate dashboard on login (REQ-4.7-1):

- **Business Owner dashboard**: Total Active/Completed/Breached Contracts, Total Suppliers, Total Deliveries, Total Inventory, Total Payments Disbursed, Top-Ranked Suppliers, Recent Activities, Notifications, Chat icon, **Current Spot Price (Price of the Day)**, **Spot Price Editor** (REQ-4.7-2, REQ-4.7-4, REQ-4.7-5).
- **Supplier dashboard**: Active Contracts, Contract Status, Delivery Progress, Payment History, Overall Supplier Rating, Recent Notifications, Chat icon, **Current Spot Price (Price of the Day)** (REQ-4.7-3).
- **Weigher dashboard**: Record Delivery, Delivery History, Pending Deliveries.
- **Laboratory Staff dashboard**: Search Delivery ID, Pending Quality Assessments, Assessment History, Notifications.

**Reports** (Business Owner only, REQ-4.7-7): Procurement Contract Report, Delivery Report, Inventory Report, Payment Report, Supplier Performance Report. Filterable by date range (REQ-4.7-8), exportable as PDF or .xlsx (REQ-4.7-9).

**Chat access**: chat icon shown on Business Owner and Supplier dashboards only — i.e. every role except Weigher and Laboratory Staff (REQ-4.7-10, REQ-4.7-11). Unread-message indicator on the icon for new messages, proposals, counteroffers, or contract-related messages (REQ-4.7-12). Notifications cover contract approvals, delivery updates, payment updates, Supplier evaluation results (REQ-4.7-13), plus the inventory-merge events from §3.6 **[Extension]**.

---

## 4. Data Model

### User Management
```
ROLES            role_id PK, role_name

USERS            user_id PK, role_id FK, first_name, last_name, email (unique), phone,
                  address, password_hash, account_status ENUM(Pending Verification,Active,Rejected,Deleted),
                  created_at, approved_by FK, approved_at
                  -- account_status = 'Active' immediately for Weigher/Lab Staff (Business Owner-created, no review step)
                  -- account_status = 'Pending Verification' at signup for Suppliers only, until Business Owner approves

USER_VERIFY       verify_id PK, user_id FK, gov_id_file_id FK, esign_file_id FK,
                  verify_status ENUM(Pending,Approved,Rejected), review_by FK, reviewed_at
                  -- applies to Suppliers only

LOGIN_HISTORY     login_id PK, user_id FK, login_timestamp, ip_address,
                  login_status ENUM(Success,Failed)

PASSWORD_RESET    reset_id PK, user_id FK, reset_token, requested_at, expires_at, used_at

WALKIN_SUPPLIERS  walkin_supplier_id PK, first_name, last_name, address, phone,
                  recorded_by FK, created_at

FILE_UPLOADS      file_id PK, uploaded_by FK,
                  file_category ENUM(Gov ID, Face ID, E-Sign, Contract Doc, Receipt, Bank QR, Other),
                  file_name, file_url, file_size, uploaded_at
```

### Negotiation & Contracts
```
CONVERSATIONS     conversation_id PK, supplier_id FK, business_owner_id FK,
                  contract_id FK, status ENUM(Open,Closed), created_at

MESSAGES          message_id PK, conversation_id FK, sender_id FK,
                  message_type ENUM(Text,Image,File,Contract Form), message_text, sent_at

MESSAGE_ATTACHMENTS  attachment_id PK, message_id FK, file_id FK

PROPOSAL_FORMS    proposal_id PK, conversation_id FK, supplier_id FK,
                  proposed_price_per_ton, proposed_quantity_tons, remarks,
                  proposal_status ENUM(Pending,Accepted,Rejected,Modified),
                  submitted_at, reviewed_by FK, counter_price_per_ton, counter_quantity_tons,
                  supersedes_proposal_id FK

CONTRACTS         contract_id PK, contract_number, supplier_id FK, business_owner_id FK,
                  negotiated_price_per_ton, contracted_tons, signing_date, activation_date,
                  due_date,  -- auto-computed = activation_date + 1 month + 1 day, never manually entered
                  status ENUM(Pending,Signed,Active,Completed,Breached), created_at

CONTRACT_SIGNATURES  signature_id PK, contract_id FK, signer_id FK,
                  signer_role ENUM(Supplier,Business Owner), esignature_file_id FK,
                  signature_order, signed_at
```

### Delivery & Quality
```
DELIVERIES        delivery_id PK,
                  delivery_source ENUM(Walkin, Contractual),
                  supplier_id FK NULL,  -- set for Contractual (registered, approved supplier); NULL for Walkin
                  walkin_supplier_id FK NULL,  -- set for Walkin only
                  batch_number, delivery_date, truck_plate_number,
                  weigher_id FK, lab_staff_id FK,
                  delivery_status ENUM(Pending,Weighed,Inspected,Accepted,Rejected),
                  payment_id FK, created_at
                  -- A Contractual delivery's quantity may be split across more than one contract
                  -- (and/or Spot Price) — see DELIVERY_ALLOCATIONS below. There is no single
                  -- contract_id here; allocation is a one-to-many relationship (REQ-4.3-9, REQ-4.4-5, REQ-4.4-9).

WEIGHING_RECORDS  weighing_id PK, delivery_id FK, weigher_id FK,
                  gross_weight_kg, tare_weight_kg, net_weight_kg, weighed_at

DELIVERY_ALLOCATIONS  allocation_id PK, delivery_id FK,
                  contract_id FK NULL,  -- NULL = this portion had no eligible Active contract, priced at Spot (REQ-4.3-10, REQ-4.4-6)
                  allocation_order,  -- sequence the cascade was applied in (earliest-deadline contract first)
                  allocated_weight_kg,  -- portion of the delivery's net weight allocated to this contract (or to Spot)
                  price_type ENUM(Negotiated, Spot),
                  created_at
                  -- One row per contract the delivery touched, in cascade order (REQ-4.3-9, REQ-4.4-3..5),
                  -- plus at most one row with contract_id = NULL for any remainder priced at Spot (REQ-4.3-10, REQ-4.4-6).
                  -- A simple delivery fully covered by one contract still gets exactly one row here.

LABORATORY_INSPECTIONS  inspection_id PK, delivery_id FK, lab_staff_id FK,
                  moisture_content_pct, inspected_at

QUALITY_RESULTS   quality_id PK, delivery_id FK, inspection_id FK,
                  result ENUM(Accepted,Rejected), remarks, evaluated_at
```

### Payments
```
PCA_DISCOUNT_TABLE  discount_id PK, moisture_content_pct, discount_value,
                    table_version, effective_date

SPOT_PRICE          spot_price_id PK, price_per_kg, updated_by FK (Business Owner), updated_at
                    -- single current value; Business Owner overwrites it manually; no date history needed

PAYMENTS          payment_id PK, delivery_id FK (one-to-one — each delivery is its own payment transaction),
                  supplier_id FK, business_owner_id FK, payment_date,
                  payment_status ENUM(Pending,Released,Failed),
                  reference_number, payment_method ENUM(Cash,Bank Transfer), created_at

PAYMENT_DETAILS   payment_detail_id PK, payment_id FK, delivery_id FK,
                  gross_weight_kg, tare_weight_kg, net_weight_kg, moisture_content_pct,
                  moisture_deduction_kg, final_weight_kg, pca_discount_id FK, pca_discount_amount,
                  payable_amount
                  -- Header row: one per payment/delivery. payable_amount = SUM of PAYMENT_DETAIL_ALLOCATIONS.line_amount
                  -- below. The delivery is still ONE payment transaction (REQ-4.5-2) even when it spans
                  -- multiple contracts and/or Spot Price.

PAYMENT_DETAIL_ALLOCATIONS  payment_detail_allocation_id PK, payment_detail_id FK, allocation_id FK (DELIVERY_ALLOCATIONS),
                  contract_id FK NULL, price_type ENUM(Negotiated, Spot), price_per_kg_used,
                  -- price_per_kg_used = contract.negotiated_price_per_ton / 1000 (Negotiated) or SPOT_PRICE.price_per_kg (Spot)
                  allocated_final_weight_kg, line_amount
                  -- One row per DELIVERY_ALLOCATIONS row on the delivery, priced independently, then summed
                  -- into the parent PAYMENT_DETAILS.payable_amount (§3.5).

E_RECEIPTS        receipt_id PK, payment_id FK, receipt_number, file_id FK, generated_at
```

### Inventory [Extension]
```
INVENTORY_BATCHES     inventory_batch_id PK, delivery_id FK,
                      source_type ENUM(Contractual, Walkin),
                      -- one batch per delivery — a Contractual delivery routes to Resecada regardless of
                      -- whether its DELIVERY_ALLOCATIONS rows are Negotiated, Spot, or a mix (§3.6)
                      batch_status ENUM(Walk-in Holding, Ready to Merge, Resecada),
                      weight_kg, recorded_date, merge_eligible_date,
                      reviewed_by_user_id FK, reviewed_at,
                      review_decision ENUM(Approved,Held),
                      merged_at, merged_into_batch_id FK

INVENTORY_TRANSACTIONS  transaction_id PK, inventory_batch_id FK,
                      transaction_type ENUM(Stock In, Merge to Resecada, Stock Out, Adjustment),
                      quantity_kg, transaction_date, performed_by FK

INVENTORY_ADJUSTMENTS   adjustment_id PK, inventory_batch_id FK, adjusted_by FK,
                      adjustment_reason, old_weight_kg, new_weight_kg, adjusted_at
```

### Ratings, Notifications, Reporting
```
SUPPLIER_PERFORMANCE_SNAPSHOT  snapshot_id PK, supplier_id FK, contract_id FK, snapshot_date,
                      contract_fulfillment_score, delivered_volume_score,
                      copra_quality_score, performance_score, supplier_rating,
                      overall_supplier_rating

NOTIFICATIONS         notification_id PK, user_id FK,
                      notification_type ENUM(Contract Signed, Contract Activated,
                        Delivery Accepted, Delivery Rejected, Payment Released,
                        Contract Completed, Contract Breached, Negotiation Message,
                        Merge Pending, Merge Ready, Merge Completed, Other),
                      message, related_entity_type, related_entity_id, is_read, created_at

AUDIT_LOGS            audit_id PK, user_id FK, action, entity_type, entity_id, created_at
```
Reports (Procurement Contract, Delivery, Inventory, Payment, Supplier Performance) are generated on-demand from the tables above, filtered by date range, and exported client-side or via an Edge Function to PDF/.xlsx — no dedicated "reports" table needed unless export history needs to be tracked later.

---

## 5. Essential Functional Requirements (condensed, by SRS section)

**4.1 User Management** — see §3.0. Covers registration, verification, RBAC login, profile editing, password recovery, session handling.

**4.2 Price Negotiation & Contract Agreement** — see §3.1. Covers Propose Price, Accept/Reject/Counteroffer, auto-contract-generation, e-signature, chat.

**4.3 Contract Management** — see §3.2. Covers fulfillment tracking, auto Completed/Breached status, deadline auto-calculation (1 month + 1 day from activation).

**4.4 Delivery & Inventory Management** — see §3.3. Covers Walk-in/Contractual delivery recording, automatic contract allocation with cascade-and-Spot-Price-fallback, exclusions from rating/payment for walk-ins.

**4.5 Payment Management** — see §3.5. Covers per-delivery payment computation, Xendit disbursement, e-receipts, duplicate-payment prevention.

**4.6 Supplier Performance Rating** — see §3.7. Covers the weighted scoring formula, 1–5 rating conversion, Overall Rating averaging, supplier ranking.

**4.7 Dashboard & Reporting** — see §3.8. Covers role-specific dashboards, the 5 report types, date-range filtering, PDF/.xlsx export, chat icon visibility rules, notifications.

**Extensions beyond the base SRS** (clarified directly, don't contradict it):
- Moisture discount lookup table (§3.4) — the SRS's Copra Quality scoring bands (§4.6.2) are only used for the Supplier Rating; it doesn't specify a discount mechanism for payment. This lookup table (seeded from `seed/pca_discount_table.sql`) fills that gap and is a *separate* computation from the rating's quality score — same `moisture_content_pct` input, two independent uses. Don't conflate them.
- Walk-in Holding → Resecada 14-day merge review (§3.6) — the SRS says walk-in deliveries "update inventory records" without detailing pooling; this adds a real inventory model with Business Owner review.

**No longer an extension** — Spot Price (§3.3, §3.5, §3.8) is now built directly from SRS §4.7 (REQ-4.7-2, 4.7-3, 4.7-5, 4.7-6), including the Business Owner's Spot Price Editor and its display on both Business Owner and Supplier dashboards. The delivery cascade-to-Spot-Price mechanism (§3.3) is likewise built directly from REQ-4.3-9/10 and REQ-4.4-3 through 6, not invented.

---

## 6. Out of Scope for This Spec
Excluded intentionally — not needed for Claude to build against:
- Bibliography / literature review
- Legal & regulatory compliance boilerplate
- Development methodology (Agile ceremonies, sprint planning)
- Project timeline / Gantt chart / team responsibilities
- Testing plan narrative (write tests as normal engineering practice instead)

## 7. Known Divergence From the SRS's Literal Text — Confirm Before Building

The SRS's §2.5 "Technical Constraints" and §3.3 "Software Interfaces" state the backend should be **Express.js running on Node.js**, with custom **JWT** auth and PostgreSQL accessed directly. This build spec instead specifies **Supabase** (Postgres + Supabase Auth issuing JWTs + Edge Functions in place of a custom Express server) — a deliberate substitution made with the business owner because Supabase satisfies the same underlying requirements (REQ-4.1-14/15/16 auth+RBAC, PostgreSQL as the DB, REQ-5.3-1..7 security) with far less infrastructure to build and host solo. This is **not** an accidental gap — it's called out explicitly here so it isn't "corrected" back to Express/Node by mistake, and so it's raised with the business owner/adviser if SRS literal-compliance matters for grading or sign-off. Everything else in Section 1 (Project Overview) and the CLAUDE.md tech stack section reflects this intentional choice.

If this substitution is *not* acceptable and Express.js/Node.js is actually required, that's a from-scratch architecture change (a real backend server to write and host, custom JWT issuance/verification, RLS gets replaced by app-layer middleware) — flag it before Phase 1 rather than partway through the build.
