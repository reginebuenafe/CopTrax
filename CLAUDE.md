# CopTrax — Current Project Status

Last reviewed: 2026-08-16

CopTrax is NERC Copra Trading's procurement system. It covers supplier onboarding, negotiation and contracts, deliveries, weighing, laboratory inspection, payments, inventory, supplier ratings, notifications, chat, and reports.

## Stack and structure

- Frontend: React 19, Vite, TailwindCSS (`frontend/`)
- Backend: Supabase Auth, PostgreSQL, Storage, Realtime, RLS, Edge Functions, and pg_cron (`supabase/`)
- Integrations: Gemini ID OCR, DocuSeal contracts, Xendit payments
- Deployment target: Render for the frontend and Supabase for backend services
- Roles: Business Owner, Supplier, Weigher, Laboratory Staff

The repository currently has no `docs/build-spec.md`, `docs/build-prompt.md`, or `docs/requirements.md`. Until an authoritative specification is restored, this file describes the current intended flow. Do not invent missing business rules; ask before making a material workflow change.

## Current implementation highlights

- Registration now formats Philippine phone numbers and supports local bank QR decoding with a Philippine bank/e-wallet selector and masked-account safeguards.
- The inactivity policy is now 15 minutes with a warning during the final 60 seconds.
- Negotiation routes were consolidated around `BOChatLayout` and `SupplierChatLayout`; obsolete conversation/chat page components were removed.
- Supplier full chat is now a two-panel maximized experience, while Business Owner full chat retains its three-panel workflow. Both layouts are mobile responsive.
- The Supplier widget supports maximize/return flow, hides while full chat is open, renders contract cards safely, and uses colored text for completed proposal outcomes.
- Proposal notifications now distinguish acceptance, rejection, and received counteroffers. A new enum migration supports the added labels.
- Business Owner and Supplier navigation now uses fixed, collapsible warm-white sidebars with green active states.
- The Business Owner overview now includes a time-aware Admin greeting, current date, and compact editable Spot Price card.
- Business Owner contract review now opens inside CopTrax through DocuSeal's embedded React form. Pending contracts remain read-only until the Supplier signature timestamp exists, then the BO can complete the DocuSeal submission.
- Proposal and counteroffer chains alternate between Supplier and Business Owner. Accepting the latest pending offer atomically finalizes its price and volume; further offer actions are blocked afterward.
- Acceptance opens the existing New Contract modal automatically only for the live acceptance event. Reloading an already-finalized conversation never reopens it; the Send Contract button remains available for manual access.
- Final negotiation terms are read-only in the contract modal, and a unique database constraint permits only one contract per finalized conversation.
- DocuSeal generation uses template `5441999` (`https://docuseal.com/d/jtLfHaeksfSED5`) with Helvetica 11px API-filled values.
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
- Only a Supplier initiates negotiation by submitting price and volume. The Business Owner can accept, reject, or counteroffer. A Supplier receiving a BO counteroffer can accept, reject, or submit another counteroffer. The exchange can continue until acceptance or rejection.
- Proposal and counteroffer submissions are represented by centered cards and are not duplicated as ordinary chat messages. Accept/reject outcomes are centered system text with perspective-correct wording.
- `proposal_forms.submitted_by` identifies the sender throughout alternating counteroffer chains. Proposal inserts and updates are protected by participant-aware RLS policies.
- New proposal cards, decisions, and conversation finalization synchronize through Supabase Realtime without duplicate local/realtime entries or a page refresh.
- Completed proposal cards disappear from the Supplier widget. Supplier-facing result text is green for accepted, red for rejected, and blue for counteroffers, using NERC-oriented wording.
- Supplier notifications use `Proposal Accepted`, `Proposal Rejected`, and `Counteroffer Received`; legacy proposal notifications stored as `Contract Signed` are normalized in the UI.
- Accepting the latest proposal/counteroffer atomically stores `accepted_proposal_id`, agreed price, agreed volume, Supplier, Business Owner, conversation, and finalization timestamp.
- The existing New Contract modal opens automatically once at the moment of acceptance: directly after a successful BO acceptance or from the live proposal acceptance event when a Supplier accepts a BO counteroffer.
- Persisted accepted status, page refreshes, chat reopening, query refetches, and component remounts do not automatically reopen the modal. Closing it keeps the finalized negotiation intact and leaves Send Contract available for manual reopening.
- Supplier name, generated contract ID, contract date, projected delivery deadline, final price, and final volume are automatic. Final price and volume are read-only and cannot be renegotiated in the contract modal.
- Sending creates or updates the single pending contract for that conversation, generates the DocuSeal document, and posts the contract card in chat. A unique partial index prevents multiple contracts for one conversation.
- Business Owner contract-card and document-review actions open one full-height embedded DocuSeal modal instead of navigating away. New chat cards carry a read-only PDF preview rather than the BO bearer signing URL. Supplier authorization records the first signature while keeping the contract Pending; BO DocuSeal completion activates it through the webhook.
- DocuSeal currently uses template ID `5441999`. API-filled contract values use Helvetica 11px because DocuSeal supports Helvetica, Times, and Courier rather than Arial. `supplier_signatory_name` is uppercase, bold, and centered; `contract_date` is the stable contract send/creation date.
- The DocuSeal template must retain the exact API field names. The normal SELLER detail uses `supplier_name`; the name above the seller signature line must use the separate `supplier_signatory_name` field; the date beneath Contract # uses `contract_date`.
- Opening an existing unsigned Pending contract from the BO review modal refreshes its values and typography. Signed submissions are immutable. Existing submissions remain associated with the template from which they were originally created and are not migrated to template `5441999` by a refresh.
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
- Atomic negotiation finalization and one-contract-per-conversation enforcement
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
6. Migrations `20260815000019_enforce_proposal_decision_roles.sql`, `20260815000020_enable_proposal_realtime.sql`, `20260816000021_counteroffer_submitter_and_permissions.sql`, and `20260816000022_finalize_negotiation_contract_guard.sql` must be applied together for alternating offers, realtime proposal events, atomic acceptance, finalized terms, and the one-contract constraint.
7. Template `5441999` must contain fields named `contract_number`, `contract_date`, `supplier_name`, `supplier_signatory_name`, `supplier_address`, `contract_quantity`, `negotiated_price`, `negotiated_price_in_romanized`, `due_date`, and `supplier_signature`. Field coordinates and widths are maintained in the DocuSeal template editor.
8. Existing contract chat messages created before the embedded review update may still contain the older DocuSeal slug payload. Newly generated cards use the partially filled PDF URL instead.
9. Existing DocuSeal submissions do not switch templates when refreshed. Only new submissions use template `5441999`.
10. `process-payment/index.ts` still contains placeholder Xendit bank code/account values; payment disbursement is not production-ready until it reads the Supplier's stored bank account.
11. The local Node version is 20.17.0. Current Vite tooling recommends Node 20.19+ or 22.12+.
12. The frontend production build passes, with a non-blocking warning about the main JavaScript chunk exceeding 500 kB.

## Required configuration

Frontend `frontend/.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase secrets:

- `GEMINI_API_KEY`
- `DOCUSEAL_API_KEY`
- `DOCUSEAL_WEBHOOK_SECRET` (DocuSeal HMAC secret used to verify webhook requests)
- `XENDIT_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (normally injected by Supabase)

The active DocuSeal template ID is currently the `DOCUSEAL_TEMPLATE_ID` constant in `supabase/functions/generate-contract/index.ts`, not a deployed secret. After changing the constant or contract field mapping, redeploy `generate-contract`.

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

## Non-negotiable business rules
Do not simplify, "improve," or guess differently on these — they were deliberately refined against the official SRS:

1. Roles: Only Suppliers self-register — requiring first name, last name, email (unique), contact number, password, a government-issued ID upload, an e-signature upload, and bank account details. Supplier accounts start Pending Verification until Business Owner reviews and approves/rejects (with email notification either way); pending Suppliers cannot access the dashboard. Weigher and Laboratory Staff accounts are created directly by the Business Owner in-app — no self-registration, no approval step, active immediately. Business Owner's own account is seeded directly in the database.
2. Negotiation: Supplier submits price/quantity via "Propose Price". Business Owner can Accept / Reject (ends negotiation entirely) / Counteroffer. Counteroffers loop back and forth until one side Accepts (→ contract) or Rejects (→ terminated). Contract auto-populates from the accepted terms — no manual re-entry.
3. Contract deadline is auto-computed: activation_date + 1 month + 1 day. Never manually entered or negotiated.
4. Contract status: auto-Completed when agreed quantity fully delivered; auto-Breached when deadline passes before that. Only Active contracts accept normal delivery transactions.
5. Weigher: first screen after login is a choice — Walk-in or Contractual. If a delivery is attempted against a contract that's already Completed/Breached, it becomes a Non-Contract Delivery — still accepted and paid (at Spot Price), but does not affect that contract's quantity/fulfillment/status at all.
6. Moisture discount: literal lookup table (seed/pca_discount_table.sql), never a formula. MC < 5.0% → 0% discount. MC > 20.2% → automatic Rejection, no payment.
7. Payment price: Contractual deliveries → contract.negotiated_price_per_ton (pro-rated to weight). Non-Contract deliveries → current spot_price (single value, Business Owner overwrites manually, no date history). Each delivery is its own separate payment transaction — never batched.
8. Inventory: Contractual and Non-Contract accepted deliveries → straight into Resecada pool. Walk-in deliveries → separate Walk-in Holding pool. After 14 calendar days, batch flips to Ready to Merge and Business Owner is notified Merge is never automatic — Business Owner must explicitly approve or hold each one.
9. Supplier Rating: computed only on contract Completed/Breached. 60% Contract Fulfillment + 20% Delivered Volume + 20% Copra Quality → 1–5 rating. Overall rating = average across the supplier's contracts. Walk-in suppliers and Non-Contract deliveries never factor in.
10. Dashboards: each role sees only their own SRS-defined widget set (see build-spec.md §3.8). Chat icon appears only on Business Owner and Supplier dashboards, never Weigher or Laboratory Staff.
11. Reports: Business Owner only — Procurement Contract, Delivery, Inventory, Payment, Supplier Performance. Must support date-range filtering and PDF/.xlsx export.
12. Notifications: contract events, delivery accept/reject, payment released, contract completed/breached, negotiation messages, and the three inventory-merge events (Pending, Ready, Completed).
13. Bank accounts: Self-service — every user (Supplier, Business Owner, staff) can edit their own bank details directly in Account Settings. No approval flow. Suppliers set their initial bank info during registration.
Hard constraints

## Hard constraints
- No business logic belongs in the frontend beyond calling Supabase — all computation (payment, discount lookup, rating, merge eligibility, deadline checks) lives in Edge Functions or SQL, never client-side.
- Role-based access is enforced via Postgres Row Level Security (RLS) policies, not just app-layer checks — every table with role-sensitive data needs an RLS policy, not just a frontend guard.
- Don't invent business rules not in docs/build-spec.md — ask instead of guessing.
- Don't build anything from docs/build-spec.md §6 "Out of Scope" (literature review, legal/compliance boilerplate, project-management artifacts).
- Reuse the existing landing page's visual design system for new dashboard pages rather than introducing a new style.
