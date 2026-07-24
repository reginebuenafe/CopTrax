# CopTrax — Build Specification

> Distilled from the capstone SRS for implementation. This is the working spec Claude should build against — not the full paper. Academic sections (bibliography, legal/regulatory boilerplate, testing methodology, project management/Gantt chart) are intentionally excluded as non-actionable for development.

---

## 1. Project Overview

CopTrax is a web-based procurement management system for **NERC Copra Trading**. It digitizes the flow of buying copra (dried coconut kernel) from suppliers: price negotiation → contract → delivery → weighing → quality testing → payment → inventory.

**Stack**
- Frontend: React.js, deployed on Render (Static Site)
- Backend: Supabase — Postgres database, Supabase Auth, Edge Functions (Deno/TypeScript) for custom business logic, Scheduled Functions/pg_cron for the 14-day inventory merge check
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth; role stored on the user's profile row, enforced via Row Level Security (RLS) policies rather than custom middleware
- Payments: Xendit (payment gateway) — weekly disbursement, every Friday, triggered from an Edge Function
- PDF generation: jsPDF (+ html2canvas for e-receipts), run inside an Edge Function or client-side depending on where the data is available
- Deployment: Render (frontend static site) + Supabase (database, auth, functions) — no separate backend server to host

---

## 2. User Roles

| Role | Account Creation | Core Purpose |
|---|---|---|
| **Business Owner** | Seeded manually (not self-registered) | Admin. Manages suppliers, negotiates & approves contracts, reviews inventory merges, approves weekly payments, views analytics/ratings |
| **Supplier** | Self-registers, account pending approval | Negotiates price via chat, signs contracts, tracks deliveries/payments/rating |
| **Weigher** | Self-registers, account pending approval | Records deliveries (Walk-in or Contractual) at intake |
| **Laboratory Staff** | Self-registers, account pending approval | Records moisture content / quality assessment per delivery |

All four roles have login. Business Owner is the only role without public signup — it's pre-seeded.

---

## 3. Core Workflows

### 3.1 Negotiation → Contract
1. Supplier and Business Owner negotiate via real-time chat (`CONVERSATIONS`, `MESSAGES`).
2. Supplier taps **"Propose Price"** → a form pops up for **price per kg** and **volume** → submits (`PROPOSAL_FORMS`, `proposal_status = 'Pending'`).
3. Business Owner reviews the proposal and takes one of three actions:
   - **Accept** → `proposal_status = 'Accepted'`
   - **Decline** → `proposal_status = 'Rejected'`
   - **Edit (counteroffer)** → Business Owner submits new price/volume → `proposal_status = 'Modified'`, new proposal row created referencing `supersedes_proposal_id`, sent back to the Supplier for their own Accept/Decline/Edit response. This can loop until both sides land on `Accepted`.
4. Once a proposal is **Accepted** by both parties, the system automatically pulls the agreed price and volume into a new contract (`CONTRACTS`) — no manual re-entry needed.
5. Both parties e-sign (`CONTRACT_SIGNATURES`) — supplier's signature is uploaded once at registration and auto-inserted on future contracts.
6. Contract status: `Pending → Signed → Active → Completed / Breached`.

### 3.2 Weigher flow
1. On login, Weigher sees two options: **Walk-in** or **Contractual** delivery.
2. **Contractual**: select active contract → enter gross/tare/net weight → delivery linked to contract, updates contract fulfillment progress.
3. **Walk-in**: enter supplier name, address, delivery date, weight → recorded independently, no contract link, settled in cash outside the system.
4. Either path creates a `DELIVERIES` + `WEIGHING_RECORDS` row and status becomes `Weighed`, awaiting lab inspection.

### 3.3 Laboratory Staff flow
1. Selects a `Weighed` delivery.
2. Enters moisture content % (`LABORATORY_INSPECTIONS`).
3. System looks up `PCA_DISCOUNT_TABLE` for the deduction tied to that moisture %, produces `QUALITY_RESULTS` (`Accepted` / `Rejected`).
4. Delivery status becomes `Inspected` → `Accepted` or `Rejected`.

**Moisture discount rule** (table only covers 5.0%–20.2% moisture content, seeded from `seed/pca_discount_table.sql` — NERC Copra Trading's official PCA table):
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

### 3.4 Payment (contractual deliveries only)
1. Business Owner reviews accepted deliveries.
2. System determines which price applies, based on delivery date vs. contract due date:
   ```
   deduction = net_weight_kg × (discount_value / 100)
   final_weight_kg = net_weight_kg − deduction

   IF delivery_date <= contract.due_date:
       price_used = contract.negotiated_price_per_kg
       price_type = 'Negotiated'
   ELSE:
       price_used = SPOT_PRICE.price_per_kg   -- current value, whatever it holds at computation time
       price_type = 'Spot'
       contract.status → set to 'Breached'    -- late delivery automatically breaches the contract

   payable_amount = final_weight_kg × price_used
   ```
3. **A late delivery (past due date) automatically marks the contract `Breached`.** This in turn triggers the Supplier Rating computation in §3.6 with a 0% Contract Fulfillment score.
4. `discount_value` comes from the `PCA_DISCOUNT_TABLE` / formula rule in §3.3.
5. Deliveries are batched weekly; Business Owner approves the batch.
6. On approval, system sends disbursement request to Xendit → funds transfer to supplier's bank account → e-receipt generated.
7. Walk-in deliveries are excluded entirely — cash, off-system.

**Spot Price** is a single current value the Business Owner updates manually whenever needed — not tied to a specific date. It always holds whatever was last set; late-delivery payments simply read its current value at the moment payment is computed. It's also displayed on the Business Owner's dashboard as "Today's Spot Price: ₱X".

### 3.5 Inventory — Contractual vs. Walk-in (updated model)
- **Contractual deliveries** go straight into the main **Resecada** inventory pool upon acceptance.
- **Walk-in deliveries** (generally lower quality) enter a separate **Walk-in Holding** pool, kept apart from Resecada.
- Each walk-in batch has a `merge_eligible_date` = `recorded_date + 14 calendar days`.
- **On record**: notify Business Owner — "[X] kg walk-in copra recorded on [date], eligible to merge into Resecada on [merge_eligible_date]."
- **On the eligible date**: batch status changes to `Ready to Merge`; notify Business Owner — "[X] kg walk-in copra is ready to merge into Resecada. Review and approve."
- **Merge is NOT automatic.** Business Owner reviews the "Ready to Merge" queue and either:
  - **Approves** → batch status becomes `Resecada`, weight added to the pool, `Merge to Resecada` transaction logged, "Merge Completed" notification sent.
  - **Holds** → batch stays in `Ready to Merge` until the Business Owner acts later (no forced timeout).

### 3.6 Supplier Performance Rating
Computed automatically when a contract is marked `Completed` or `Breached`:

| Criterion | Weight | Scoring |
|---|---|---|
| Contract Fulfillment | 60% | 100% if fulfilled on/before deadline, 0% if breached |
| Delivered Volume | 20% | 50+ tons=100%, 40–49.99=80%, 30–39.99=60%, 20–29.99=40%, ≤10=20% |
| Copra Quality (Moisture) | 20% | 6.5–7.4%=100%, 7.5–8.4%=80%, 8.5–9.4%=60%, 9.5–10.4%=40%, 10.5–20.2%=20%, >20.2%=Rejected (0%) |

`Performance Score = (Fulfillment×0.6) + (Volume×0.2) + (Quality×0.2)`

Convert to 1–5 rating: 90–100%→5, 70–89%→4, 50–69%→3, 30–49%→2, 0–29%→1

`Overall Supplier Rating = average of all per-contract ratings for that supplier` — used for ranking suppliers on the Business Owner's dashboard.

---

## 4. Data Model

### User Management
```
ROLES            role_id PK, role_name

USERS            user_id PK, role_id FK, first_name, last_name, email, phone,
                  address, password_hash, account_status ENUM(Pending,Active,Rejected,Deleted),
                  created_at, approved_by FK, approved_at

USER_VERIFY       verify_id PK, user_id FK, gov_id_file_id FK, esign_file_id FK,
                  verify_status ENUM(Pending,Approved,Rejected), review_by FK, reviewed_at

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
                  proposed_price_per_kg, proposed_volume_tons,
                  proposal_status ENUM(Pending,Accepted,Rejected,Modified),
                  submitted_at, reviewed_by FK, counter_price_per_kg, supersedes_proposal_id FK

CONTRACTS         contract_id PK, contract_number, supplier_id FK, business_owner_id FK,
                  negotiated_price_per_kg, contracted_tons, signing_date, due_date,
                  status ENUM(Pending,Signed,Active,Completed,Breached), created_at

CONTRACT_SIGNATURES  signature_id PK, contract_id FK, signer_id FK,
                  signer_role ENUM(Supplier,Business Owner), esignature_file_id FK,
                  signature_order, signed_at
```

### Delivery & Quality
```
DELIVERIES        delivery_id PK, delivery_source ENUM(Walkin,Contract-based),
                  contract_id FK, walkin_supplier_id FK, batch_number, delivery_date,
                  truck_plate_number, weigher_id FK, lab_staff_id FK,
                  delivery_status ENUM(Pending,Weighed,Inspected,Accepted,Rejected),
                  payment_id FK, created_at

WEIGHING_RECORDS  weighing_id PK, delivery_id FK, weigher_id FK,
                  gross_weight_kg, tare_weight_kg, net_weight_kg, weighed_at

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

PAYMENTS          payment_id PK, supplier_id FK, business_owner_id FK, payment_date,
                  payment_week, total_amount, payment_status ENUM(Pending,Released,Failed),
                  reference_number, payment_method ENUM(Cash,Bank Transfer), created_at

PAYMENT_DETAILS   payment_detail_id PK, payment_id FK, delivery_id FK,
                  gross_weight_kg, tare_weight_kg, net_weight_kg, moisture_content_pct,
                  moisture_deduction_kg, final_weight_kg,
                  price_type ENUM(Negotiated, Spot), price_per_kg_used,
                  pca_discount_id FK, pca_discount_amount, line_amount

E_RECEIPTS        receipt_id PK, payment_id FK, receipt_number, file_id FK, generated_at
```

### Inventory (updated — walk-in holding + review-based merge)
```
INVENTORY_BATCHES     inventory_batch_id PK, delivery_id FK,
                      source_type ENUM(Contractual,Walkin),
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

### Dashboard, Ratings, Notifications
```
SUPPLIER_PERFORMANCE_SNAPSHOT  snapshot_id PK, supplier_id FK, snapshot_date,
                      contract_fulfillment_score, delivered_volume_score,
                      copra_quality_score, performance_score, supplier_rating,
                      overall_supplier_rating

NOTIFICATIONS         notification_id PK, user_id FK,
                      notification_type ENUM(Contract Signed, Contract Activated,
                        Delivery Accepted, Delivery Rejected, Weekly Payment Ready,
                        Payment Released, Contract Completed, Contract Breached,
                        Deadline Reminder, Merge Pending, Merge Ready, Merge Completed, Other),
                      message, related_entity_type, related_entity_id, is_read, created_at

AUDIT_LOGS            audit_id PK, user_id FK, action, entity_type, entity_id, created_at
```

---

## 5. Essential Functional Requirements (condensed)

**Auth & Users**
- Suppliers, Weighers, and Laboratory Staff self-register; account starts `Pending` until Business Owner approves.
- Business Owner account is seeded directly in the database — no public signup route for this role.
- Supabase Auth for login; role stored on the user's profile row determines which routes/UI the user can access, enforced at the database level via Row Level Security (RLS) policies.
- Password reset via emailed token.

**Negotiation & Contracts**
- Real-time chat between Supplier and Business Owner.
- Supplier submits a price/volume proposal via a "Propose Price" form; Business Owner can Accept, Decline, or Edit (counteroffer).
- Counteroffers loop back to the other party for their own Accept/Decline/Edit response until both sides accept.
- Contract auto-populated with the agreed price and volume once a proposal is accepted; requires both e-signatures before becoming `Active`.

**Deliveries**
- Weigher must choose Walk-in or Contractual at the start of every delivery entry.
- Contractual delivery requires selecting an active contract; system auto-updates delivered/remaining contract quantity.
- Walk-in delivery requires supplier name, address, date, weight — no contract link, cash-settled, excluded from ratings/contract fulfillment/electronic payment.
- No deliveries allowed under `Completed`, `Breached`, or `Cancelled` contracts.

**Quality**
- Laboratory Staff submits moisture % per delivery; system looks up deduction from `PCA_DISCOUNT_TABLE` and marks delivery `Accepted`/`Rejected`.

**Payments**
- System computes payable amount per accepted contractual delivery automatically.
- Business Owner approves weekly batch → triggers Xendit disbursement → e-receipt generated.
- Walk-in deliveries never enter payment processing.

**Inventory**
- Contractual accepted deliveries go straight into Resecada.
- Walk-in deliveries enter Walk-in Holding, separate from Resecada.
- System flags a batch `Ready to Merge` 14 days after recording and notifies the Business Owner — does not merge automatically.
- Business Owner explicitly approves each merge; "Held" batches remain visible until acted on.

**Supplier Rating**
- Computed only when a contract is `Completed` or `Breached`.
- Uses the weighted formula in §3.6; updates the supplier's Overall Rating and dashboard ranking automatically.

**Notifications**
- Generated for: contract signed/activated, delivery accepted/rejected, weekly payment ready/released, contract completed/breached, deadline reminders, and the three inventory-merge events (Pending, Ready, Completed).

---

## 6. Out of Scope for This Spec
Excluded intentionally — not needed for Claude to build against:
- Bibliography / literature review
- Legal & regulatory compliance boilerplate
- Development methodology (Agile ceremonies, sprint planning)
- Project timeline / Gantt chart / team responsibilities
- Testing plan narrative (write tests as normal engineering practice instead)
