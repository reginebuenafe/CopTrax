# Prompt: Build CopTrax — Web-Based Copra Management System

## Context

I have an existing repository containing a **frontend landing page only** (no backend yet). I need you to build out the **full application** on top of it: a real backend, database, and role-based dashboards for four user types.

Before writing any code, **read these files in full**:
1. `docs/build-spec.md` — the authoritative build specification, aligned to the official SRS (Sections 4.1–4.7, with REQ-4.x IDs for traceability). This is what you build against.
2. `docs/requirements.md` — background reference from the original capstone paper. Use only for context if `build-spec.md` is unclear on something; do not pull requirements from here that contradict or aren't reflected in `build-spec.md`.
3. `seed/pca_discount_table.sql` — real moisture-content discount data, used in payment computation.

Do not start coding until you've read all three and can summarize your understanding back to me.

---

## What you're building

**CopTrax** digitizes NERC Copra Trading's procurement process: Supplier registration/verification → negotiate price → sign contract → deliver → weigh → test quality → compute payment → manage inventory → rate supplier performance → dashboards/reports. Four roles use it: **Business Owner**, **Supplier**, **Weigher**, **Laboratory Staff**.

## Tech stack (non-negotiable)

- Frontend: React.js, deployed on Render (Static Site)
- Backend: Supabase — Postgres database, Supabase Auth, Edge Functions (Deno/TypeScript) for all custom business logic, Scheduled Functions/pg_cron for time-based checks (contract deadline, inventory merge eligibility)
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth; role stored on the user's profile row, enforced via Row Level Security (RLS) policies
- Payments: Xendit — each delivery is its own separate payment transaction, not batched
- Deployment target: Render (frontend static site) + Supabase (database, auth, functions) — there is no separate backend server to host

## Repository structure

Monorepo. Keep the existing `frontend/` landing page in place; add:
```
your-repo/
├── frontend/          → existing landing page + new role dashboards/pages
├── supabase/
│   ├── functions/       → Edge Functions (payment computation, discount lookup, merge job, deadline check, etc.)
│   └── migrations/       → SQL schema migrations
├── docs/
│   ├── build-spec.md
│   ├── build-prompt.md
│   └── requirements.md
└── seed/
    └── pca_discount_table.sql
```

---

## Non-negotiable business rules (must not be simplified or guessed differently)

These were deliberately refined against the official SRS — build to these exactly, not to whatever seems "reasonable":

1. **Roles & accounts**: Only Suppliers self-register — requiring first/last name, email (unique), contact number, password, government ID upload, and e-signature upload (reused on future contracts). Supplier accounts start `Pending Verification` until Business Owner approves/rejects (email notified either way); pending Suppliers can't reach the dashboard. Weigher and Laboratory Staff accounts are created **directly by the Business Owner** in-app — no self-registration or approval step, active immediately. Business Owner's own account is seeded directly in the database.
2. **Negotiation**: Supplier submits price/quantity via a "Propose Price" popup. Business Owner can Accept / **Reject (ends the negotiation entirely)** / Counteroffer. Counteroffers loop back and forth between both parties until one Accepts (→ contract) or Rejects (→ terminated). Contract auto-populates with agreed price/quantity — no manual re-entry.
3. **Contract deadline is auto-computed** as activation_date + 1 month + 1 day — never manually entered.
4. **Contract status is automatic**: `Completed` when the agreed quantity is fully delivered; `Breached` when the deadline passes before that. Only `Active` contracts accept normal delivery transactions.
5. **Weigher flow**: first screen after login is a choice — **Walk-in** or **Contractual**. If a delivery targets a contract that's already `Completed`/`Breached`, it becomes a **Non-Contract Delivery**: still accepted into inventory and paid (at Spot Price), but never updates that contract's quantity, fulfillment, or status.
6. **Moisture discount**: literal lookup table (`seed/pca_discount_table.sql`), never a formula. MC < 5.0% → 0% discount. MC > 20.2% → automatic Rejection, no payment.
7. **Payment price**: Contractual deliveries → `contract.negotiated_price_per_ton` (pro-rated to final weight). Non-Contract deliveries → current `spot_price` (single value, Business Owner overwrites manually, no date history). Each delivery is its own payment transaction — never batched. A delivery can never be paid twice.
8. **Inventory**: Contractual and Non-Contract accepted deliveries → straight into the Resecada pool. Walk-in deliveries → separate Walk-in Holding pool. After 14 calendar days a batch becomes `Ready to Merge` and the Business Owner is notified — **merging is never automatic**, the Business Owner must explicitly approve or hold each one.
9. **Supplier Rating**: computed only when a contract becomes `Completed` or `Breached`. Weighted formula: 60% Contract Fulfillment + 20% Delivered Volume + 20% Copra Quality (Moisture) → 1–5 rating. Overall rating = average across the supplier's contracts. Walk-in suppliers and Non-Contract deliveries never factor into ratings.
10. **Dashboards**: each role sees only its SRS-defined widget set (build-spec.md §3.8). Chat icon shows only on Business Owner and Supplier dashboards — never Weigher or Laboratory Staff.
11. **Reports**: Business Owner only — Procurement Contract, Delivery, Inventory, Payment, Supplier Performance — filterable by date range, exportable as PDF/.xlsx.
12. **Notifications**: contract events, delivery accept/reject, payment released, contract completed/breached, negotiation messages, and the three inventory-merge stages (Pending, Ready, Completed).

Full detail on every rule above — including exact formulas, table schemas, and REQ-4.x traceability — is in `docs/build-spec.md`. If anything here seems to conflict with that file, `build-spec.md` wins.

---

## Suggested build order

Work in this order, matching the SRS's own feature sequence (4.1 → 4.7), so each phase can be tested before the next depends on it:

1. **Supabase project setup**: create the project, set up the Supabase CLI locally, connect the repo.
2. **Database schema**: create all tables from `build-spec.md` §4 as SQL migrations, run the seed file for `pca_discount_table` and set up `spot_price`. Write Row Level Security (RLS) policies per role for each table.
3. **4.1 User Management**: Supplier self-registration (with ID/e-signature upload + Business Owner approval flow), Business Owner in-app creation of Weigher/Lab Staff accounts, Business Owner seed/manual insert, login, RLS policies tying access to the authenticated user's role, profile edit rules, password recovery, session handling.
4. **4.2 Negotiation & Contract Agreement**: chat, Propose Price flow, Accept/Reject/Counteroffer, contract auto-generation with auto-computed deadline, e-signature.
5. **4.3 Contract Management**: fulfillment tracking, auto Completed/Breached transitions, deadline-based scheduled check.
6. **4.4 Delivery & Inventory**: Weigher's Walk-in/Contractual/Non-Contract flow, weighing records, Laboratory Staff's moisture entry + discount lookup, the Walk-in Holding → Resecada merge model.
7. **4.5 Payment Management**: per-delivery computation (negotiated vs. spot price), Xendit integration, e-receipts, duplicate-payment prevention.
8. **4.6 Supplier Performance Rating**: computation trigger on contract completion/breach, dashboard ranking.
9. **4.7 Dashboard & Reporting**: all four role dashboards, the 5 report types with date filtering and PDF/.xlsx export, chat icon visibility rules, notifications.
10. **Frontend polish**: wire everything into the existing landing page's design system rather than introducing a new visual style.

## What NOT to build

- No literature review, legal/compliance boilerplate, or project-management artifacts from the original paper — see build-spec.md §6 "Out of Scope."
- Don't invent business rules not covered above or in build-spec.md — ask me instead of guessing.

---

## Before you start

Summarize back to me:
- Your understanding of the 4 roles and their account-creation paths
- The negotiation flow (Propose Price → Accept/Reject/Counteroffer)
- The Non-Contract Delivery rule and why it exists
- The payment computation (negotiated vs. spot price)
- The inventory merge rule
- Any open questions

Then begin with Phase 1.
