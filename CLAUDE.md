# CopTrax — Current Project Status

Last reviewed: 2026-08-15

CopTrax is NERC Copra Trading's procurement system. It covers supplier onboarding, negotiation and contracts, deliveries, weighing, laboratory inspection, payments, inventory, supplier ratings, notifications, chat, and reports.

## Stack and structure

- Frontend: React 19, Vite, TailwindCSS (`frontend/`)
- Backend: Supabase Auth, PostgreSQL, Storage, Realtime, RLS, Edge Functions, and pg_cron (`supabase/`)
- Integrations: Gemini ID OCR, DocuSeal contracts, Xendit payments
- Deployment target: Render for the frontend and Supabase for backend services
- Roles: Business Owner, Supplier, Weigher, Laboratory Staff

The repository currently has no `docs/build-spec.md`, `docs/build-prompt.md`, or `docs/requirements.md`. Until an authoritative specification is restored, this file describes the current intended flow. Do not invent missing business rules; ask before making a material workflow change.

## Updates reflected in this revision

- Registration now formats Philippine phone numbers and supports local bank QR decoding with a Philippine bank/e-wallet selector and masked-account safeguards.
- The inactivity policy is now 15 minutes with a warning during the final 60 seconds.
- Negotiation routes were consolidated around `BOChatLayout` and `SupplierChatLayout`; obsolete conversation/chat page components were removed.
- Supplier full chat is now a two-panel maximized experience, while Business Owner full chat retains its three-panel workflow. Both layouts are mobile responsive.
- The Supplier widget supports maximize/return flow, hides while full chat is open, renders contract cards safely, and uses colored text for completed proposal outcomes.
- Proposal notifications now distinguish acceptance, rejection, and received counteroffers. A new enum migration supports the added labels.
- Business Owner and Supplier navigation now uses fixed, collapsible warm-white sidebars with green active states.
- The Business Owner overview now includes a time-aware Admin greeting, current date, and compact editable Spot Price card.
- Contract storage policy creation in migration 013 is idempotent through `DROP POLICY IF EXISTS` guards.

## Current system flow

### Registration and accounts

- Only Suppliers self-register.
- Registration is a five-step wizard: government ID and OCR, personal information, selfie with ID, e-signature, and bank account.
- Required personal data includes first name, last name, unique email, Philippine contact number, password, government ID, selfie, signature, and bank details.
- Philippine phone input is formatted while typing as `0917 123 4567` and normalized for validation.
- Bank name is selected from a Philippine bank/e-wallet dropdown.
- Bank QR images are decoded locally in the browser and are not uploaded. Extracted values remain editable; hidden account numbers display as `********` and cannot be submitted until replaced.
- Supplier accounts start as `Pending Verification` and cannot access the dashboard until approved by the Business Owner.
- The Business Owner creates Weigher and Laboratory Staff accounts directly. The Business Owner account is seeded separately.
- Every role edits its own signature and bank information from Account Settings. The intended flow has no bank-change approval process.
- Authenticated users are signed out after 15 minutes of inactivity. An accessible 60-second countdown warning allows the user to stay signed in. There is currently no absolute eight-hour session limit.

### Negotiation, chat, and contracts

- Business Owner chat uses a responsive three-panel desktop layout: conversations, active chat, and Supplier details.
- Supplier chat uses a responsive two-panel desktop layout: the active BO chat and NERC details. It intentionally has no conversation-list panel because a Supplier communicates only with the Business Owner.
- On mobile, chat panels use bounded internal scrolling. Business Owner conversations and active chat become separate views with a return arrow; detail panels stack without clipping.
- Business Owner chat receives new messages through Supabase Realtime and updates the open chat and conversation preview without refresh.
- Incoming messages scroll only the message container and do not move the whole page.
- The Supplier negotiation widget has a maximize action that opens the full Supplier chat. The widget is hidden on the full-chat route to avoid duplication.
- Contract payloads render as styled contract cards instead of raw `CONTRACT_CARD` JSON in both the widget and full chat.
- A Supplier can submit price and volume. The Business Owner can accept, reject, or counteroffer; rejection ends that negotiation.
- Completed proposal cards disappear from the Supplier widget. Supplier-facing result text is green for accepted, red for rejected, and blue for counteroffers, using NERC-oriented wording.
- Supplier notifications use `Proposal Accepted`, `Proposal Rejected`, and `Counteroffer Received`; legacy proposal notifications stored as `Contract Signed` are normalized in the UI.
- The Business Owner can open the contract-making modal even before a proposal exists.
- Supplier name, generated contract ID, and projected due date are automatic in the modal.
- Price and volume are prefilled from the latest Supplier proposal when available; otherwise, the Business Owner enters them.
- Sending creates or updates the pending contract, generates the DocuSeal document, and posts the contract card in chat.
- The database remains authoritative for the final deadline: `activation_date + 1 month + 1 day`.
- Contracts become `Completed` when the agreed quantity is fully delivered and `Breached` when the deadline passes first.

### Delivery, quality, payment, and inventory

- Weigher starts by choosing Walk-in or Contractual delivery.
- Deliveries against Completed or Breached contracts become Non-Contract deliveries. They are paid at Spot Price and do not affect contract fulfillment.
- Moisture discount uses `seed/pca_discount_table.sql`; it is never calculated with an invented formula.
- Moisture below 5.0% has no discount. Moisture above 20.2% is rejected with no payment.
- Contractual deliveries use the negotiated contract price. Non-Contract deliveries use the current single Spot Price.
- Every accepted delivery is a separate payment transaction.
- Contractual and Non-Contract accepted deliveries enter the Resecada pool.
- Walk-in deliveries remain in Walk-in Holding. After 14 days they become Ready to Merge, but only the Business Owner can approve or hold the merge.
- Supplier ratings are calculated only for Completed or Breached contracts: 60% fulfillment, 20% delivered volume, and 20% quality. Walk-in and Non-Contract deliveries do not count.

### Access and reporting

- Postgres RLS, not frontend routing alone, enforces role access.
- Chat is available only to Business Owner and Supplier roles.
- Business Owner reports cover contracts, deliveries, inventory, payments, and supplier performance with date filters and PDF/XLSX export.
- Account Settings is available to all four roles.
- Business Owner and Supplier dashboard navigation is fixed in place. Sidebars use a warm-white/brown palette with a green active-page highlight and support collapsed desktop navigation.
- The Business Owner overview shows the current weekday/date, a time-aware `Good morning/afternoon/evening, Admin` greeting, and an editable current Spot Price card.

## Implemented modules

- Public landing pages and authentication flows
- Supplier registration, OCR, document upload, approval gate, and pending-approval page
- Business Owner user approval and staff-account management
- Business Owner and Supplier realtime, responsive negotiation chat and Supplier chat widget
- Proposal/counteroffer cards and Business Owner contract-making modal
- Proposal-specific notifications and realtime notification display
- DocuSeal generation, review, signing, and webhook flow
- Contract dashboards for Business Owner and Supplier
- Walk-in and contractual weighing flows
- Laboratory queue, inspection, and history
- Delivery, quality, payment, inventory, rating, notification, and reporting screens
- Shared signature and bank Account Settings
- User foreign-key cascade cleanup

## Active issues and deployment work

These are current blockers or inconsistencies, not historical notes:

1. `supabase/functions/upload-registration-files/index.ts` contains unresolved Git conflict markers and must be resolved before deployment.
2. `20260805000015_bank_accounts_and_signature_settings.sql` still creates the obsolete `bank_change_requests` flow. Add a later corrective migration for direct self-service before treating the remote schema as final.
3. The remote database migration history is ahead of missing local migrations. After correcting the bank schema, apply pending migrations with `supabase db push --include-all`.
4. `20260815000017_enable_chat_realtime.sql` must be applied for live message inserts.
5. `20260815000018_proposal_notification_types.sql` must be applied before inserting `Proposal Accepted` or `Counteroffer Received` notification types.
6. `process-payment/index.ts` still contains placeholder Xendit bank code/account values; payment disbursement is not production-ready until it reads the Supplier's stored bank account.
7. The local Node version is 20.17.0. Current Vite tooling recommends Node 20.19+ or 22.12+.
8. The frontend production build passes, with a non-blocking warning about the main JavaScript chunk exceeding 500 kB.

## Required configuration

Frontend `frontend/.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase secrets:

- `GEMINI_API_KEY`
- `DOCUSEAL_API_KEY`
- `DOCUSEAL_TEMPLATE_ID`
- `XENDIT_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (normally injected by Supabase)

## Working commands

```powershell
# Frontend
cd frontend
npm install
npm run dev
npm run lint
npm run build

# Supabase
supabase db push --include-all
supabase functions deploy <function-name> --no-verify-jwt
supabase secrets set NAME=value
```

## Implementation guardrails

- Keep payment, discount, rating, merge eligibility, deadline, and status computation in SQL or Edge Functions.
- Add RLS policies for every role-sensitive table.
- Preserve separate payment transactions per delivery.
- Never auto-merge Walk-in inventory.
- Never derive the moisture discount from a formula.
- Preserve the existing CopTrax visual system when adding screens.
- Work on one related module at a time and preserve unrelated uncommitted changes.
- Do not rename or reorder existing migrations. New schema corrections use a newer migration filename and must be safe to rerun where practical.
- Keep this file focused on current behavior, completed module coverage, active blockers, and required operations. Do not maintain a dated change log here.
