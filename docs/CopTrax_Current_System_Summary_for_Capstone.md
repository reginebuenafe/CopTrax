# CopTrax: Current System Summary for Capstone Paper Editing

**System snapshot:** October 2, 2026  
**System name:** CopTrax  
**Organization/context:** NERC Copra Trading, Kumalarang, Zamboanga del Sur, Philippines  
**Document purpose:** Provide accurate project context to an AI assistant editing the CopTrax capstone paper.

## Instructions for the paper editor

Use this document as a description of the system currently represented in the project repository. Preserve the paper's existing research design, claims, and author voice unless asked to revise them. Do not invent user study results, performance measurements, deployment status, regulatory certifications, adoption statistics, or features that are not stated here or supported by project evidence. Distinguish implemented functionality from intended benefits and design goals. If the paper needs a detail that is not provided, mark it for the student to confirm instead of guessing.

## System overview

CopTrax is a web-based procurement management system designed to digitize NERC Copra Trading's copra procurement workflow. It brings Supplier registration and verification, price negotiation, contract signing, delivery recording, weighing, laboratory quality inspection, payment processing, inventory tracking, Supplier performance ratings, and Business Owner reports into one application.

The system has four role-specific user groups: Business Owner, Supplier, Weigher, and Laboratory Staff. Each role has a separate dashboard and access to the tasks relevant to that role. The application is designed for use at physical buying stations as well as by Suppliers who may access it from mobile devices.

CopTrax combines a React web frontend with Supabase services. Role-sensitive data access is enforced primarily through PostgreSQL Row Level Security (RLS), with database functions and Supabase Edge Functions handling important operations. The frontend presents workflows and calls these backend services rather than serving as the authoritative location for business calculations.

## Users and responsibilities

| User role | Main responsibilities and system access |
|---|---|
| **Business Owner (BO)** | Reviews and approves or rejects Supplier registrations; participates in negotiations; reviews and approves contracts; oversees deliveries and quality results; manages payments and inventory; records copra sales; resolves reported delivery corrections; manages staff; reviews Supplier ratings and exports reports. |
| **Supplier** | Self-registers and waits for BO verification; negotiates price and quantity; reviews and signs contracts; tracks contracts, deliveries, payments, and ratings; accesses receipts for eligible payments belonging to their account; manages personal account and bank details. |
| **Weigher** | Records contractual or walk-in deliveries, including weighing information. Can report an incorrect weight with supporting evidence but cannot directly change the submitted recorded weight through the report workflow. |
| **Laboratory Staff** | Reviews the inspection queue and records moisture/quality results. Can report an incorrect moisture reading with supporting evidence but cannot directly change the recorded reading through the report workflow. |

The Business Owner account is provisioned by the project administrators. Supplier accounts are self-registered and require BO verification. Weigher and Laboratory Staff accounts are created by the BO.

## Main workflows and modules

### 1. Supplier registration and verification

Supplier registration is a multi-step process that collects identity and contact information, government ID, selfie, electronic signature, and bank details. The registration flow includes a final review step so the Supplier can inspect or edit information before explicitly submitting. The system can use a Google Gemini Vision-powered Edge Function to extract selected information from an uploaded ID.

After submission, the Supplier profile remains pending verification. The BO reviews the account and uploaded verification documents in User Management and can approve or reject the registration. A pending Supplier cannot use the approved Supplier dashboard. Account settings also support profile, electronic signature, and self-service bank-detail updates; bank-detail changes do not use an approval queue.

### 2. Negotiation and contract creation

Supplier and BO communicate through the system's conversation and negotiation interface. A Supplier can propose price and quantity. The BO can accept, reject, or counteroffer; counteroffers can continue between the parties until acceptance or rejection. Rejection terminates the negotiation. Accepted terms are reused when preparing the contract.

AI-assisted functions support parts of the negotiation and Supplier question-answering experience. The Supplier-facing FAQ assistant can answer informational questions, provide PCA moisture-table information, and offer to notify the BO for requests that require human discretion. AI-generated messages are identified in the Supplier interface. These assistants do not replace the parties' authority to accept or reject an agreement.

Contracts are generated from the agreed terms and use in-house cryptographic signing rather than a third-party signing provider. The contract terms are hashed with SHA-256 and rendered to PDF using pdf-lib. The Supplier signs first; the contract then awaits explicit BO review and approval/signature before becoming Active. The contract deadline is computed from the activation date as one month plus one day.

### 3. Delivery recording and allocation

After login, Weighers choose between a contractual delivery and a walk-in delivery. The delivery flow records weighing data and associates contractual deliveries with eligible contracts when applicable.

For a Supplier with multiple Active contracts, eligible contract capacity is prioritized by the earliest delivery deadline. If a delivery exceeds one contract's remaining quantity, the excess can be allocated to the next eligible Active contract. Any quantity remaining after eligible contracts are filled is treated as a non-contract allocation at the current Spot Price. The authoritative allocation operation is database-backed and is designed to avoid concurrent over-allocation.

Contractual deliveries against contracts that are no longer Active are handled as non-contract deliveries under the applicable current business rules; they do not add fulfillment to Completed or Breached contracts. Delivery pages show the recorded delivery, relevant weights and quality details when available, status, and allocation breakdown.

### 4. Laboratory inspection and PCA moisture deduction

Laboratory Staff inspect queued deliveries and record moisture content and quality results. PCA moisture deductions use the literal lookup data in `seed/pca_discount_table.sql`; the system is not intended to substitute an approximate formula.

Current boundary behavior is:

- Moisture content below 5.0 cc receives 0% deduction.
- At exactly 5.0 cc, the applicable PCA table row is used (currently 2.0%).
- Moisture content above 20.2 cc is automatically rejected and is not paid.

For accepted deliveries, the deduction affects final weight. The system stores and uses delivery allocations based on the applicable final weight after the quality deduction, rather than treating pre-deduction net weight as the final credited contractual quantity.

### 5. Issue reporting and correction

Weighers can report a Weight Correction issue and Laboratory Staff can report an MC Correction issue. Each correction report is linked to its delivery and requires a reason plus two evidence photos: the relevant scale/apparatus reading and a paper receipt or slip.

Only the BO can apply the correction. The BO reviews the current value and proposed corrected value before confirming. The database operation updates dependent values through the existing allocation and PCA calculation mechanisms where relevant, rather than changing only the displayed value. A permanent correction audit record remains after the issue is resolved. Evidence photos can be removed after the correction and audit record are committed; failed storage cleanup can be retried without rolling back the correction.

### 6. Payments and receipts

Payment amounts depend on the applicable negotiated contract price or current Spot Price and the accepted, allocated delivery quantity after PCA deduction. Each delivery is treated as its own payment transaction rather than being combined into a batch payment.

Payment processing integrates with Xendit. The project context identifies the payment setup as sandbox/test mode; this should not be described as a live production payment service without separate confirmation. The BO can review and release eligible payments. Suppliers can review their own payment history and view receipts when the payment/receipt is available under the existing BO receipt rules. Supplier receipt access is scoped to the authenticated Supplier's own payment and delivery/contract relationship.

### 7. Inventory and copra sales

Accepted contractual and non-contract deliveries are added to the Bodega Stock (Resecada) pool. Walk-in deliveries use a separate Walk-in Holding pool. Walk-in batches become eligible for review after the configured holding period, but merging into Bodega Stock is an explicit BO decision; it is not automatic.

The BO Inventory page displays stock information and capacity usage. A database notification is configured for Bodega Stock capacity thresholds. The BO can also record a Copra Sale using a review-and-confirm workflow. Each sale is stored as a persistent record and reduces the aggregate Bodega Stock calculation without editing or deleting the original delivery or inventory-batch records. Sale entries are available in the Copra Sales Report.

### 8. Supplier performance ratings

Supplier ratings are computed for Completed or Breached contracts from contract fulfillment, delivered volume, and copra quality. The configured weighting is 60% fulfillment, 20% delivered volume, and 20% quality. Overall Supplier rating is an average across the Supplier's contract snapshots. Walk-in transactions and non-contract allocations do not contribute to contract-based Supplier ratings. A Breached contract receives zero for the delivered-volume component under the current rule.

### 9. Business Owner dashboard and reports

The BO dashboard provides operational summaries and analytics, including contract and delivery activity, quality, payment status, Supplier performance, and recent notifications. Dashboard widgets and navigation are role-specific; chat access is provided to the BO and Suppliers, not Weighers or Laboratory Staff.

The BO Reports area includes:

1. Procurement Contract Report
2. Delivery Report
3. Inventory Report
4. Payment Report
5. Supplier Performance Report
6. Copra Sales Report

Reports support date-range filtering and PDF and XLSX exports. The same report data and column definitions are used to keep the on-screen presentation and exports consistent. Inventory reporting distinguishes net weight from after-deduction weight and handles contractual and walk-in units separately.

### 10. Account settings, notifications, and audit history

Account Settings is shared across user roles and includes account details, security, notification preferences, appearance, bank details, and electronic signature management. Signature capture can use a camera modal where browser/device permissions allow it.

Notifications cover relevant account, contract, delivery, payment, negotiation, inventory, and assistance events. Owner-originated administrative changes are recorded in the `audit_logs` table for the operations wired to that audit facility.

## Technical architecture

| Layer | Current technologies and responsibilities |
|---|---|
| **Web client** | React 19, Vite, React Router, Tailwind CSS, and shared React components. Provides the public pages and role-specific application dashboards. |
| **Authentication** | Supabase Auth. Role and account status are associated with user profile data and used by routing and database authorization. |
| **Database and authorization** | Supabase-hosted PostgreSQL. Ordered SQL migrations define schema, enums, foreign keys, RLS policies, RPCs, triggers, scheduled jobs, and backfills. |
| **Server-side operations** | Supabase Edge Functions written in Deno/TypeScript for custom operations and external service integrations; reusable helpers live in `supabase/functions/_shared/`. Database functions/RPCs handle operations requiring database-level validation or atomicity. |
| **Realtime and file storage** | Supabase Realtime supports relevant live updates. Supabase Storage holds uploaded files; sensitive documents use private storage patterns and authorized/signed access. |
| **AI services** | Google Gemini is used by the ID information extraction function and AI assistant functions. |
| **Payments** | Xendit integration is configured for sandbox/test-mode behavior according to project documentation. |
| **Contract documents** | In-house SHA-256 contract-term binding and PDF generation/signing with pdf-lib. |

The repository describes Render as the intended frontend hosting platform and Supabase as the backend platform. The project product notes say the system is not yet in production; deployment or real-world operational use should not be claimed without updated evidence.

## Security and data-integrity approach

- PostgreSQL RLS and database-level authorization protect role-sensitive records; frontend route guards alone are not treated as sufficient authorization.
- Sensitive actions verify the authenticated caller and role in an Edge Function or database function/RPC.
- Suppliers can access only their own account-related payment and receipt data.
- Private verification and evidence files are stored using controlled storage paths and access patterns.
- Contract signing includes a hash of canonical terms to support tamper detection and an audit record of signing.
- Delivery allocation and correction operations use backend/database logic to preserve atomicity and keep dependent values aligned.
- Administrative audit records and correction history provide traceability for supported operations.

## Development and project status

CopTrax is maintained as a capstone/school project and is described in the project materials as not yet in production. The repository contains the frontend source, Supabase migrations and functions, seed data, and project-specific implementation notes. The frontend defines `dev`, `build`, `lint`, and `preview` npm scripts. The repository currently has no configured frontend unit-test script or dedicated frontend test suite.

The project changelog records focused manual, integration, and browser-based verification for selected workflows. Such validation notes are not equivalent to a formal controlled user study, production reliability study, or statistically measured evaluation. Do not convert them into quantitative claims unless the paper includes independently verified test plans and results.

## Important terminology

- **MC:** Moisture content, recorded in cc in the system's user-facing domain terminology.
- **PCA deduction:** Deduction percentage obtained from the PCA lookup table and applied to determine the post-deduction final weight.
- **Net weight:** Weighed delivery weight after tare is subtracted, before a PCA moisture deduction.
- **Final weight / after-deduction weight:** Weight after the applicable PCA deduction.
- **Contractual delivery:** Delivery allocated to one or more eligible Active contracts at negotiated prices.
- **Non-contract allocation:** Eligible delivery quantity not credited to an Active contract; priced using the current Spot Price under the applicable rules.
- **Walk-in delivery:** A delivery recorded through the Weigher's walk-in flow and initially tracked in a separate Walk-in Holding inventory pool.
- **Bodega Stock / Resecada:** The inventory pool for accepted copra allocated to the relevant stock pool, after the applicable quality/deduction processing.
- **Spot Price:** The current owner-managed spot price used for applicable non-contract pricing; it is a current value, not a historical time series in the described implementation.

## Source files for further verification

When editing the capstone paper, use these checked-in sources to verify implementation details:

- `README.md` — project summary, stack, roles, and setup information.
- `PRODUCT.md` — product users, purpose, operating context, and constraints.
- `CLAUDE.md` — business rules and dated implementation changelog.
- `frontend/src/` — frontend routes, role pages, and shared components.
- `supabase/migrations/` — authoritative database schema, RLS, functions, triggers, and changes.
- `supabase/functions/` — server-side Edge Functions and shared helpers.
- `seed/pca_discount_table.sql` — PCA discount lookup seed data.

Some checked-in documentation refers to `docs/requirements.md` or `docs/build-spec.md`, but these documents were not present in the repository when this summary was prepared. Confirm against the actual code and migrations instead of treating those missing documents as evidence.

## Suggested instruction to append when asking ChatGPT to edit the paper

> Please edit my capstone paper using the attached CopTrax current-system summary as factual background. Improve clarity, grammar, organization, academic tone, and consistency, but preserve my intended meaning and research scope. Do not invent data, test outcomes, participant feedback, citations, production deployment, or features. If the paper conflicts with the summary or needs information not provided, flag the point for me to verify rather than silently assuming. Keep technical claims consistent with the current implementation and distinguish implemented features from intended benefits.
