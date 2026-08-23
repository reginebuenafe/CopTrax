# CLAUDE.md

This file is read automatically at the start of every session in this repo.

# CRITICAL: NEGOTIATION & CHAT LOGIC IS LOCKED

## 🚨 ABSOLUTE RULE — DO NOT MODIFY NEGOTIATION LOGIC
The existing negotiation and chat functionality is **WORKING AND MUST BE TREATED AS LOCKED / PROTECTED LOGIC**.

When making ANY changes to this project, **DO NOT alter, refactor, rewrite, simplify, optimize, reorganize, replace, or otherwise modify the existing functional logic related to chat-based price negotiation.**

This restriction applies even if you believe the current implementation could be cleaner, more efficient, more maintainable, or better structured.

**IF IT WORKS, LEAVE IT ALONE.**

---

## PROTECTED COMPONENTS / AREAS
The following components and their associated logic are STRICTLY PROTECTED:

- `NegotiationChatWidget`
- `SupplierChatLayout`
- Business Owner `ConversationsPage`
- Supplier conversation/chat pages
- Business Owner conversation/chat pages
- Any component, hook, service, utility, API call, database query, realtime subscription, state handler, or helper involved in negotiation chat
- Any shared code used by the negotiation/chat system
This protection is **NOT limited to these exact filenames**.

If another file participates in or affects the negotiation/chat workflow, **its negotiation-related logic must also be treated as protected.**

---

## PROTECTED NEGOTIATION BEHAVIOR
DO NOT change the logic responsible for:

- Sending normal chat messages
- Receiving chat messages
- Realtime chat updates
- Conversation creation
- Conversation retrieval
- Conversation identification
- Message ordering
- Chat state management
- Supplier proposals
- Price proposals
- Volume/quantity proposals
- Counteroffers
- Accepting offers
- Declining offers
- Determining who sent an offer
- Determining who received an offer
- Determining which party may respond
- Proposal status handling
- Negotiation state transitions
- Finalizing agreed price
- Finalizing agreed volume/quantity
- Contract generation triggered by negotiation
- Contract messages sent through negotiation
- Automatic/system-generated negotiation messages
- Business Owner vs Supplier sender/recipient behavior
- Realtime subscriptions/listeners
- Existing Supabase queries/mutations used by negotiation
- Existing database interactions supporting negotiation
- Existing negotiation-related side effects
Do not change these behaviors unless the user **EXPLICITLY requests a modification to that exact behavior.**

---

## BUSINESS RULES THAT MUST REMAIN INTACT
The existing negotiation workflow must remain unchanged.

The Supplier initiates a negotiation by proposing a price and volume.

The Business Owner may respond according to the existing implementation.

Counteroffers, acceptance, and decline behavior must continue functioning exactly as currently implemented.

The system must continue correctly identifying the sender and recipient of offers.

Only the appropriate recipient of an offer should receive the corresponding negotiation actions according to the existing implementation.

When an agreement is reached, the existing finalized price, finalized volume, contract generation, contract messaging, and related workflow must remain intact.

**DO NOT recreate this logic from scratch.**

**DO NOT introduce a new negotiation architecture.**

**DO NOT modify working behavior while implementing unrelated features.**

---

# FRONTEND / DESIGN CHANGES ARE ALLOWED
You MAY modify the visual frontend of these components when requested.

Allowed changes include:

- Colors
- Typography
- Font sizes
- Spacing
- Padding
- Margins
- Borders
- Border radius
- Shadows
- Icons
- Button appearance
- Message bubble appearance
- Card appearance
- Responsive layout
- Visual hierarchy
- Alignment
- CSS
- Tailwind classes
- Purely presentational JSX structure when necessary
However:

> **A frontend/design change MUST NOT change functional behavior.**
When changing the UI, preserve:

- Existing event handlers
- Existing callback behavior
- Existing state behavior
- Existing props
- Existing data flow
- Existing API/database calls
- Existing Supabase calls
- Existing realtime subscriptions
- Existing conditions
- Existing role checks
- Existing negotiation actions
- Existing side effects
- Existing sender/recipient logic
If changing the JSX structure requires moving an existing handler, move it **without changing what the handler does**.

---

# DO NOT "CLEAN UP" WORKING NEGOTIATION CODE
Do NOT perform opportunistic refactoring.

For example, while editing the design, DO NOT:

- Rewrite handlers
- Merge handlers
- Rename or restructure negotiation state unnecessarily
- Replace existing queries
- Rewrite Supabase subscriptions
- Change `useEffect` dependencies without necessity
- Change proposal conditions
- Change sender/recipient checks
- Change role checks
- Change status comparisons
- Replace existing negotiation functions with "cleaner" versions
- Extract working logic into new hooks/services
- Consolidate negotiation components
- Change database schemas related to negotiation
- Modify RLS policies related to negotiation
- Change message/proposal data structures
- Remove code because it appears redundant
- Fix unrelated warnings by altering negotiation logic
- Make speculative bug fixes
**NO REFACTORING FOR THE SAKE OF REFACTORING.**

---

# MINIMUM-CHANGE RULE
For every requested modification:

1. Identify the exact code required for the requested change.
2. Modify the smallest possible amount of code.
3. Preserve all unrelated behavior.
4. Do not touch negotiation/chat logic unless the requested task specifically requires it.
5. Do not modify additional files merely for cleanup or consistency.
6. Do not introduce architectural changes unless explicitly requested.
A request involving a page that contains negotiation functionality **does NOT automatically grant permission to modify the negotiation logic.**

For example:

If asked to redesign `NegotiationChatWidget`, you may redesign its appearance.

You **MUST NOT** rewrite how proposals, messages, counteroffers, acceptance, decline, contracts, or realtime updates work.

---

# EXPLICIT OVERRIDE REQUIRED
Negotiation/chat logic may ONLY be modified when the user explicitly identifies the specific negotiation behavior they want changed.

Example:

> "Change the behavior so that after the Supplier accepts the Business Owner's counteroffer, X should happen."
Only the logic necessary to implement **X** may be modified.

This does **NOT** grant permission to refactor the rest of the negotiation system.

After making the requested behavioral change, all other negotiation behavior must remain exactly as before.

---

# BEFORE MODIFYING NEGOTIATION-RELATED FILES
Before editing any protected file, first determine:

**Is this change actually necessary to satisfy the user's request?**

If NO:

**DO NOT MODIFY THE FILE.**

If YES, determine:

**Can this request be completed by changing presentation/UI only?**

If YES:

**CHANGE PRESENTATION ONLY. DO NOT TOUCH LOGIC.**

If logic modification is explicitly required:

**CHANGE ONLY THE MINIMUM LOGIC NECESSARY FOR THE SPECIFIC REQUEST.**

---

# REGRESSION PROTECTION
Any change involving these components must preserve the complete existing negotiation workflow.

Do not introduce regressions into:

`Supplier → Proposal → Business Owner Response → Counteroffer (if applicable) → Acceptance/Decline → Finalized Terms → Contract Generation → Contract Signing/Viewing`

Normal chat messaging and realtime synchronization must also continue functioning exactly as before.

A change is **NOT successful** if the requested feature works but an existing negotiation/chat feature stops working.

---

# PRIORITY
These rules have HIGH PRIORITY for all future modifications.

When there is uncertainty about whether a change could affect negotiation/chat functionality:

**DO NOT CHANGE IT.**

Prefer preserving known-working behavior over refactoring, optimization, cleanup, or architectural improvements.

### FINAL RULE

> **THE NEGOTIATION AND CHAT SYSTEM IS WORKING. DO NOT TOUCH ITS FUNCTIONAL LOGIC UNLESS THE USER EXPLICITLY REQUESTS A SPECIFIC LOGIC CHANGE. FRONTEND/DESIGN CHANGES ARE ALLOWED, BUT THEY MUST PRESERVE THE EXISTING LOGIC EXACTLY.**

## Project

**CopTrax** — a web-based procurement management system for NERC Copra Trading. Digitizes: registration/verification → negotiate price → sign contract → deliver → weigh → test quality → compute payment → manage inventory → rate suppliers → report. Four roles: **Business Owner**, **Supplier**, **Weigher**, **Laboratory Staff**.

Background/original SRS text: `docs/requirements.md` (reference — use this as the primary spec document).

## Tech stack

- Frontend: React.js (Vite) + TailwindCSS
- Backend: Supabase — Postgres database, Supabase Auth, Edge Functions (Deno/TypeScript) for custom business logic, Scheduled Functions/pg_cron for time-based checks (contract deadline, inventory merge eligibility)
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth; role stored on the user's profile row, enforced via Row Level Security (RLS) policies — not custom JWT middleware
- Payments: Xendit — each delivery is its own separate payment transaction, not batched
- Contract signing: In-house cryptographic signature binding (SHA-256 hash of contract terms + authenticated JWT + pdf-lib PDF generation) — no third-party signing service
- ID scanning (registration): Google Gemini vision API via `extract-id-info` Edge Function
- Deployment: Render (frontend static site) + Supabase (database, auth, functions)

## Repo structure

```
frontend/          → landing page + role dashboards (React + Vite + Tailwind)
supabase/
  functions/        → Edge Functions
  migrations/        → SQL schema migrations
docs/
  requirements.md
seed/
  pca_discount_table.sql
```

## Commands

```
# Frontend
cd frontend && npm install
cd frontend && npm run dev          # local dev server
cd frontend && npm run build        # production build
cd frontend && npm run lint         # ESLint

# Supabase
supabase start                                                # local stack (Docker)
supabase db push                                              # apply migrations to linked project
supabase functions deploy <name> --no-verify-jwt              # deploy Edge Function
supabase secrets set NAME=value                               # set a function secret
psql $SUPABASE_DB_URL -f seed/pca_discount_table.sql          # seed discount table + spot_price
```

## Environment / secrets

Supabase secrets that must be set for full functionality:
- `GEMINI_API_KEY` — Google AI Studio key (free tier), used by `extract-id-info` for ID OCR
- `XENDIT_SECRET_KEY` — used by payment Edge Function
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase into Edge Functions

Frontend `.env` (in `frontend/`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Non-negotiable business rules

Do not simplify, "improve," or guess differently on these — they were deliberately refined against the official SRS:

1. **Roles**: Only Suppliers self-register — requiring first name, last name, email (unique), contact number, password, a government-issued ID upload, an e-signature upload, and bank account details. Supplier accounts start `Pending Verification` until Business Owner reviews and approves/rejects (with email notification either way); pending Suppliers cannot access the dashboard. Weigher and Laboratory Staff accounts are created **directly by the Business Owner** in-app — no self-registration, no approval step, active immediately. Business Owner's own account is seeded directly in the database.
2. **Negotiation**: Supplier submits price/quantity via "Propose Price". Business Owner can Accept / **Reject (ends negotiation entirely)** / Counteroffer. Counteroffers loop back and forth until one side Accepts (→ contract) or Rejects (→ terminated). Contract auto-populates from the accepted terms — no manual re-entry.
3. **Contract deadline is auto-computed**: activation_date + 1 month + 1 day. Never manually entered or negotiated.
4. **Contract status**: auto-`Completed` when agreed quantity fully delivered; auto-`Breached` when deadline passes before that. Only `Active` contracts accept normal delivery transactions.
5. **Weigher**: first screen after login is a choice — **Walk-in** or **Contractual**. If a delivery is attempted against a contract that's already `Completed`/`Breached`, it becomes a **Non-Contract Delivery** — still accepted and paid (at Spot Price), but does not affect that contract's quantity/fulfillment/status at all.
6. **Moisture discount**: literal lookup table (`seed/pca_discount_table.sql`), never a formula. MC < 5.0% → 0% discount. MC > 20.2% → automatic Rejection, no payment.
7. **Payment price**: Contractual deliveries → `contract.negotiated_price_per_ton` (pro-rated to weight). Non-Contract deliveries → current `spot_price` (single value, Business Owner overwrites manually, no date history). Each delivery is its own separate payment transaction — never batched.
8. **Inventory**: Contractual and Non-Contract accepted deliveries → straight into Resecada pool. Walk-in deliveries → separate Walk-in Holding pool. After 14 calendar days, batch flips to `Ready to Merge` and Business Owner is notified. **Merge is never automatic** — Business Owner must explicitly approve or hold each one.
9. **Supplier Rating**: computed only on contract `Completed`/`Breached`. 60% Contract Fulfillment + 20% Delivered Volume + 20% Copra Quality → 1–5 rating. Overall rating = average across the supplier's contracts. Walk-in suppliers and Non-Contract deliveries never factor in.
10. **Dashboards**: each role sees only their own SRS-defined widget set (see `docs/requirements.md` §3.8). Chat icon appears only on Business Owner and Supplier dashboards, never Weigher or Laboratory Staff.
11. **Reports**: Business Owner only — Procurement Contract, Delivery, Inventory, Payment, Supplier Performance. Must support date-range filtering and PDF/.xlsx export.
12. **Notifications**: contract events, delivery accept/reject, payment released, contract completed/breached, negotiation messages, and the three inventory-merge events (Pending, Ready, Completed).
13. **Bank accounts**: Self-service — every user (Supplier, Business Owner, staff) can edit their own bank details directly in Account Settings. **No approval flow.** Suppliers set their initial bank info during registration.
14. **Multi-contract delivery allocation**: When a Supplier has multiple Active contracts, the system prioritizes the contract with the **earliest delivery deadline**. If an accepted delivery exceeds the remaining quantity of the current contract, the system completes that contract and automatically allocates the excess to the next eligible Active contract (ordered by earliest deadline) at that contract's negotiated unit price. This cascades until the full delivery is allocated. Any remaining quantity after all Active contracts are exhausted is processed at the current **Spot Price** (as a Non-Contract allocation). This logic lives in an Edge Function — never client-side.

## Hard constraints

- No business logic belongs in the frontend beyond calling Supabase — all computation (payment, discount lookup, rating, merge eligibility, deadline checks) lives in Edge Functions or SQL, never client-side.
- Role-based access is enforced via Postgres Row Level Security (RLS) policies, not just app-layer checks — every table with role-sensitive data needs an RLS policy, not just a frontend guard.
- Don't invent business rules not in `docs/requirements.md` — ask instead of guessing.
- Don't build anything from `docs/requirements.md` §6 "Out of Scope" (literature review, legal/compliance boilerplate, project-management artifacts).
- Reuse the existing landing page's visual design system for new dashboard pages rather than introducing a new style.

## Workflow preference

Build and review one module at a time (see build order in `docs/requirements.md`, in SRS section order: 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7). Don't build multiple unrelated modules in one pass.

---

## Recent changes (keep this updated)

Newest first. When you land a meaningful change, add a bullet here so teammates who "read CLAUDE.md" see what shifted.

### 2026-08-24 — BO Dashboard analytics upgrade

- **`OwnerOverview.jsx`** rebuilt into a full analytics dashboard. Existing greeting, spot-price card, 4 summary stat cards, staff-account modal, and toast are all preserved unchanged.
- **6 new analytics sections** added, all reading existing data with no new business logic:
  1. **Delivery Volume** — CSS bar chart of accepted net-weight (kg) grouped by month for the last 6 months, with current-month total and month-over-month comparison.
  2. **Contract Progress** — active contracts with progress bars (delivered kg / contracted kg), remaining kg, supplier name; reuses same contract + `delivery_allocations` query pattern as `BOContractsPage`.
  3. **Quality Overview** — tile grid: accepted / rejected / awaiting counts + avg MC + avg PCA discount %; reads `laboratory_inspections` + `quality_results`, same discount-from-remarks logic as the rest of the system.
  4. **Payment Summary** — total paid (Released), pending batch amount, unbatched accepted-delivery count; reads `payments` + `deliveries` with no new payment math.
  5. **Top Suppliers** — top-5 by `overall_supplier_rating` from `supplier_performance_snapshot` with progress bars; same table/query used by `SupplierRatingsPage`.
  6. **Recent Activity** — last 8 BO notifications from the `notifications` table with relative timestamps.
- Staff Account Management section kept but made compact and moved to the bottom of the page.
- "Awaiting Inspection" stat card path updated to `/deliveries` (Quality Results page was removed from BO sidebar in the previous session).



- **`BODeliveriesPage`**: now fetches `delivery_allocations` (with per-contract price and weight) and displays an **Allocation Breakdown** panel in the expanded delivery view, showing each slice (contract number + price type + allocated kg + price/kg). The summary subtitle uses `contractLabel()` to show the single contract number or "N Contracts" for multi-contract deliveries; the inaccurate `isLate` badge is removed.
- **`SupplierDeliveriesPage`**: same `contractLabel()` helper applied to the summary row; an **Allocation** section in the expanded detail lists each allocation slice (Negotiated vs Spot, contract name, weight). The Payment section's price type is now derived from actual `delivery_allocations.price_type` (Negotiated / Spot / Mixed) instead of the incorrect `isLate` flag.
- No schema or Edge Function changes needed — the cascade allocation engine (`buildAllocationPreview` in `ContractualDeliveryForm`, `delivery_allocations` table, `check_contract_completion_on_acceptance` trigger, and payment calculation in `PaymentsPage`) was already fully correct.



- Government ID OCR now receives a compressed, maximum-2048px JPEG while registration retains the original image, with an original-image fallback for browser-incompatible formats such as HEIC. Stale overlapping scan results are ignored, navigation waits for active scanning, scan success is reported accurately, and extracted first name, last name, and address values are normalized to Title Case in both the registration UI and extraction Edge Function. Login and registration pages include responsive Back to Homepage controls.
- Fixed Account Settings repeatedly mounting and unmounting when its sensitive-session timeout activated. Authentication initialization now remains stable while timeout-duration changes restart only the idle timer.
- Account Settings now follows the compact cream tabbed reference layout with Account, Security, Notifications, and Appearance panels. Supplier identity/contact fields, bank details, and electronic-signature preview/upload/camera controls are grouped in the Account panel while the existing update behavior is preserved.

### 2026-08-19 — Chat UX, Negotiation Finalization, Contract Documents, Session Security

**Negotiation and realtime chat:**
- Supplier proposals and both parties' counteroffers are represented by centered proposal cards instead of duplicate generated chat messages. Only the party receiving the latest offer sees Accept / Reject / Counteroffer actions; accepted, rejected, and countered outcomes use consistent centered system text.
- Counteroffers now support a continuous Supplier -> BO -> Supplier loop. Accepting the latest offer finalizes the agreed price and volume, prevents further offers, and makes the finalized terms available to contract creation.
- BO acceptance opens the existing New Contract modal immediately; Supplier acceptance opens it on the BO side through Realtime. This automatic opening is event-based and occurs only once, never again from refreshes or persisted accepted rows. Manual Send Contract access remains available, and duplicate contract creation is guarded.
- BO conversation visibility and unread behavior now include proposals, but a conversation created merely by opening a Supplier chat remains hidden from the BO until the Supplier sends a real message or proposal. Message/proposal updates are synchronized and deduplicated across `BOChatLayout`, `SupplierChatLayout`, and `NegotiationChatWidget` without refreshes.
- Proposal and Counteroffer modal drafts persist across browser-tab switches. Counteroffer fields are prefilled with the current offer's price and volume.
- Supplier notifications now distinguish Proposal Accepted, Proposal Rejected, and Counteroffer Received instead of incorrectly reporting proposal acceptance as Contract Signed.

**Chat layouts and widget:**
- `BOChatLayout` and `SupplierChatLayout` were restyled with the current cream/brown/green design system, responsive panel behavior, fixed chat navigation, mobile layouts, compact quick-action chips, and typing areas without attachment buttons. Supplier chat removes the unnecessary conversation-list panel and includes Return to Home navigation and first-conversation welcome actions.
- Both full chat headers use Supabase Presence to show the other party as Online or Offline; the avatar and lower-right presence dot turn green online and gray offline.
- `NegotiationChatWidget` is available on Supplier pages except `SupplierChatLayout`, includes Close, Maximize, and View Contracts controls, shares the same realtime messages/proposals/contracts, and uses the same welcome state and negotiation actions as full chat.
- The widget bubble's yellow badge is now shown only for unread messages received from the BO. It displays the unread count (capped at `99+`), clears when opened, persists correctly across refreshes, synchronizes read state across tabs, and ignores the Supplier's own messages and duplicate realtime deliveries.

**Contract creation, signing, and viewing:**
- Added reusable `ContractDocumentModal.jsx`. Contract document actions now open PDFs inside CopTrax rather than a new browser tab in BO chat, Supplier chat, and the negotiation widget.
- Contract viewers resolve the latest storage path by contract ID and subscribe to contract updates, so an open viewer silently switches to the signed PDF after Supplier signing. The widget and Supplier contract cards use the `Review & Sign Contract` label and retain the existing authorization/signing workflow.
- The shared `contract_pdf.ts` renderer is the authoritative source for unsigned and signed PDFs. Body paragraphs use Word-style justification, while the centered title/business address and signatory blocks retain their own alignment. Contract date, delivery deadline, dynamic values, signatures, and audit footer remain generated by the shared renderer. Existing stored PDFs are immutable snapshots; formatting changes apply to newly generated or newly signed documents after deploying both `generate-contract` and `sign-contract`.

**Authentication, registration, and dashboard UI:**
- App-wide idle security now uses a 15-minute default timeout with a warning at 14 minutes and a one-minute Stay Signed In action. Sensitive bank/payment contexts can request the scoped 5-minute timeout without changing the global default.
- Supplier registration now formats phone input as `0917 123 4567`. Bank registration supports a Philippine bank dropdown and local QR decoding with file type/size/dimension/payload limits; recognized bank, account-holder, and account-number data are filled when present, while unclear account numbers remain masked/manual rather than guessed.
- Owner and Supplier sidebars use the cleaner light cream/white palette with green active-page highlighting, responsive drawers, persistent collapse state, and centered collapsed Sign Out controls.
- Owner Overview now shows the current day/date, time-aware Admin greeting, and an editable spot-price card matching the Supplier dashboard style while retaining the BO pencil action.

### 2026-08-18 — Negotiation, Realtime Chat, Contract Viewing, Contracts Page

**Negotiation flow fixes:**
- **`submitted_by` column added to `proposal_forms`** (migration 025): replaces the fragile index-parity logic (`latestProposalIndex % 2`) with an authoritative `submitted_by UUID` field. `ProposePriceModal` now writes `submitted_by: userId` on every INSERT. Legacy rows (NULL) fall back to index parity. Both `BOChatLayout` and `SupplierChatLayout` now derive `latestSubmittedByBO/Supplier` from this field — correct regardless of rejections, re-proposals, or any deviation from perfect alternation.
- **Supplier-only initial proposals enforced at DB level** (migration 023/024): `proposals_insert` RLS requires `supersedes_proposal_id IS NOT NULL` for Business Owner inserts (counteroffers only) and caps Supplier initial proposals at 3 Active contracts maximum.
- **`setProposalActing(false)` missing in Supplier `rejectProposal`**: after rejecting a BO counteroffer, the Accept/Counter/Decline buttons were permanently disabled for the rest of the session. Fixed.
- **Proposal card hides immediately** on Accept/Decline: both BO and Supplier now optimistically update local proposal state before the async DB round-trip, so the card disappears instantly rather than waiting for a full `loadChat` or refetch.
- **BO action chip renamed**: "Propose Price" → "Counteroffer" (it opens the counter modal, not a fresh proposal). Propose Price is Supplier-only under all conditions.
- **Supplier Propose Price button**: always visible in header when conversation is Open (green + clickable unless ≥3 Active contracts; grayed with tooltip when capped).
- **`canPropose` rule**: blocked only when supplier already has 3 or more Active contracts (not per-conversation contract status).

**Realtime chat fixes:**
- **Migration 022 (`REPLICA IDENTITY FULL`)**: added to `messages`, `proposal_forms`, `contracts`, `conversations`. Required for Supabase Realtime `postgres_changes` with RLS-filtered subscriptions to correctly deliver events to both parties.
- **Scroll fix**: replaced fragile `isInitialLoad` ref (consumed by `setMessages([])` before real messages arrive) with two clean `useEffect`s — `[chatLoading]` jumps to bottom when load finishes; `[messages]` smooth-scrolls only when user is near bottom.
- **BO contracts listener no longer calls `loadChat`**: was `() => loadChat(conversationId)` on contract UPDATE, which cleared all messages via `setMessages([])`. Replaced with a targeted contracts-only refetch using `currentConvRef`.
- **Client-side `conversation_id` guard** added to message INSERT callbacks as belt-and-suspenders.
- **Subscription dependency array** in BO cleaned up (removed `loadChat` since contracts listener no longer uses it).

**Contract viewing:**
- **Supplier "View Contract" button** added to `SupplierChatLayout` contract card: when a contract is signed (`Active`/`Completed`/`Breached`), the card now shows "✓ Contract Active" badge + a "View Contract" button that opens a 15-min Supabase Storage signed URL. Path priority: `contractRow.contract_document_url` (signed PDF) → `cardData.document_path` (preview PDF).

**Contracts page (BO and Supplier):**
- **Filters**: both pages now use `All | Pending | Active | Completed | Breached`. "Signed" filter removed from both `STATUS_META` and `FILTERS` arrays.
- **BO Contracts page data**: added Agreed Price, Agreed Quantity, Activation Date, Delivery Deadline, Delivered Qty, Remaining Qty, Fulfillment % (progress bar). Delivered weight computed from `delivery_allocations.allocated_weight_kg` (Accepted deliveries only) via a two-query approach — contracts fetched first, then allocations joined via `delivery_id → deliveries(delivery_status)` in a separate query.
- **BO Contracts page fix** (migration 026): `contracts_select` RLS now includes `OR get_my_role() = 'Business Owner'` — was the only contracts policy not using `get_my_role()`, causing the BO to see 0 contracts when `business_owner_id` didn't exactly match `auth.uid()`. Conversations join also removed from the contracts query (fragile named-FK reverse embed replaced with a third flat query).

**Migrations added this session** (run in order in Supabase SQL Editor):
- `20260818000022_realtime_replica_identity.sql` — REPLICA IDENTITY FULL
- `20260818000023_bo_counteroffer_only.sql` — BO can only INSERT counteroffers
- `20260818000024_supplier_max_3_active_contracts.sql` — cap at 3 Active contracts
- `20260818000025_proposal_forms_submitted_by.sql` — ADD COLUMN submitted_by
- `20260818000026_contracts_select_bo_role.sql` — fix BO seeing 0 contracts

### 2026-08-16 — Cryptographic Signature Binding (DocuSeal removed)

- **Replaced DocuSeal** with an in-house cryptographic signing flow. No more `DOCUSEAL_API_KEY` or `DOCUSEAL_TEMPLATE_ID` secrets needed. The `docuseal-webhook` Edge Function is deleted.
- **Contract generation** (`generate-contract`): now computes a SHA-256 hash of the canonical contract terms, renders an unsigned PDF via `pdf-lib` matching the `docs/contract_template.docx` layout, and stores it in the `contracts` Supabase Storage bucket. The hash + a JSON snapshot of terms are persisted on the `contracts` row for tamper detection.
- **Contract signing** (`sign-contract`): verifies signer identity via JWT, re-hashes the stored terms to detect tampering, embeds both parties' signature images into a final signed PDF, records an immutable `contract_signatures` audit row with the hash, IP address, User-Agent, and timestamp.
- **New migration `20260816000017_cryptographic_signing.sql`**: adds `contract_hash`, `contract_terms_snapshot` to `contracts`; adds `signature_hash`, `ip_address`, `user_agent`, `signature_image_url` to `contract_signatures`; adds an immutability trigger preventing UPDATE/DELETE on `contract_signatures`.
- **Shared helpers** added: `supabase/functions/_shared/contract_hash.ts` (canonical JSON + SHA-256) and `supabase/functions/_shared/contract_pdf.ts` (pdf-lib renderer).
- **Frontend**: all DocuSeal external links, iframe embeds, and `docuseal_*` column references removed from `BOChatLayout`, `SupplierChatLayout`, `BOContractsPage`, `ContractReviewModal`, `SupplierContractReviewModal`. Contract PDFs are now fetched via Supabase Storage signed URLs.

### 2026-08-14 — Bank self-service, ID scanning, FK cleanup

- **Bank accounts simplified to self-service** — removed the entire "Bank Change Request → BO approval" flow. Every user now edits their own bank details directly in `AccountSettingsPage.jsx`. `BankChangeRequestsPage.jsx` deleted, route removed from `App.jsx` and `OwnerLayout.jsx`. The `bank_change_requests` table is no longer created — bank RLS is a single `bank_accounts_self_manage` policy plus BO read-all. **Suppliers now enter bank details during registration** (`upload-registration-files` seeds the row via service role).
- **Registration is now a 5-step wizard** — `RegisterPage.jsx` was restructured into: (1) Government ID upload, (2) Personal Info, (3) Selfie with ID, (4) E-Signature, (5) Bank Account. Per-step validation, Back/Next navigation, single form state persisted across steps.
- **AI-powered ID OCR** — new Edge Function `extract-id-info` uses Google Gemini vision (`gemini-flash-latest` with automatic fallback to `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-flash-lite-latest` on 503/429/500). Called from Step 1 of registration to auto-fill first name, last name, and address. Requires `GEMINI_API_KEY` secret. Retries transient errors 3× with backoff.
- **User FK cascades fixed** — new migration `20260815000016_fix_user_fk_cascades.sql`. All foreign keys referencing `public.users(user_id)` now have proper `ON DELETE CASCADE` (owned rows: contracts, deliveries, payments, notifications, messages, inventory batches) or `ON DELETE SET NULL` (soft references: weigher/lab assignments, "reviewed by", "recorded by"). Deleting a user from the Supabase Auth dashboard now works cleanly. Migration uses defensive `DO $$ ... $$` with `information_schema` checks so it's safe to re-run and skips missing tables/columns.
- **Code cleanup** — removed several unused variables and dead code across the frontend (BankChangeRequestsPage, unused `useAuth` in ContractReviewModal, `peso()` helper in InventoryPage, stray `filtered`/`initials` in SupplierChatLayout, etc.). No behavior changes; build passes.

### 2026-08-05 — Bank accounts, signature settings, contract signing flow

- Added `bank_accounts` table + `user_verify` signature columns (migration `20260805000015`).
- Added `Account Settings` page (shared) with signature upload/preview and bank fields.
- DocuSeal integration replaced (see 2026-08-16 entry above): `generate-contract` Edge Function creates the contract PDF from accepted proposal + BO-side review; `sign-contract` handles supplier-side sign.
- Contract review modals on both BO and Supplier sides (`ContractReviewModal.jsx`, `SupplierContractReviewModal.jsx`).
- 3-panel chat UI redesign for BO (`BOChatLayout.jsx`) and Supplier (`SupplierChatLayout.jsx`).

### 2026-08-03 / 2026-08-04 — Contract enhancements

- Migrations `20260803000013_contract_enhancements.sql` and `20260804000014_contract_signing_flow.sql`: added contract signing columns and status enum values.

### Earlier — Baseline

- Initial schema + RLS policies (migrations 1–10)
- Delivery allocation logic (migration 9)
- Documents storage bucket (migration 10)
- Pg_cron for merge eligibility + deadline reminders (migrations 4, 7)
- Realtime notifications (migration 5)

---

## Notes for teammates

- **After pulling**: run `cd frontend && npm install` if `package.json` changed, and check if there are new migrations in `supabase/migrations/` you need to apply. Migrations are safe to re-run (idempotent).
- **New Edge Functions**: if you see a new folder under `supabase/functions/`, deploy it with `supabase functions deploy <name> --no-verify-jwt` (all our functions run with JWT verification disabled and check auth manually).
- **New secrets**: check the "Environment / secrets" section above — if a function fails with "X_API_KEY not configured", set the secret in the Supabase dashboard.
- **Migration ordering**: filenames are `YYYYMMDDNNNNNN_description.sql`. Never rename or reorder existing migrations. Add new ones with the current date and a new sequence number.
