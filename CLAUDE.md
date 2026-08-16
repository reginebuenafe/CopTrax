# CLAUDE.md

This file is read automatically at the start of every session in this repo.

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
10. **Dashboards**: each role sees only their own SRS-defined widget set (see build-spec.md §3.8). Chat icon appears only on Business Owner and Supplier dashboards, never Weigher or Laboratory Staff.
11. **Reports**: Business Owner only — Procurement Contract, Delivery, Inventory, Payment, Supplier Performance. Must support date-range filtering and PDF/.xlsx export.
12. **Notifications**: contract events, delivery accept/reject, payment released, contract completed/breached, negotiation messages, and the three inventory-merge events (Pending, Ready, Completed).
13. **Bank accounts**: Self-service — every user (Supplier, Business Owner, staff) can edit their own bank details directly in Account Settings. **No approval flow.** Suppliers set their initial bank info during registration.

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
