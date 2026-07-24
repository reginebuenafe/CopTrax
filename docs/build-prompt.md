# Prompt: Build CopTrax — Web-Based Copra Management System

## Context

I have an existing repository containing a **frontend landing page only** (no backend yet). I need you to build out the **full application** on top of it: a real backend, database, and role-based dashboards for four user types.

Before writing any code, **read these files in full**:
1. `docs/build-spec.md` — the authoritative build specification. This is what you build against.
2. `docs/requirements.md` — background reference from the original capstone paper (SRS). Use only for context if `build-spec.md` is unclear on something; do not pull requirements from here that contradict or aren't reflected in `build-spec.md`.
3. `seed/pca_discount_table.sql` — real moisture-content discount data, used in payment computation.

Do not start coding until you've read all three and can summarize your understanding back to me.

---

## What you're building

**CopTrax** digitizes NERC Copra Trading's procurement process: negotiate price → sign contract → deliver → weigh → test quality → compute payment → manage inventory. Four roles use it: **Business Owner**, **Supplier**, **Weigher**, **Laboratory Staff**.

## Tech stack (non-negotiable)

- Frontend: React.js, deployed on Render (Static Site)
- Backend: Supabase — Postgres database, Supabase Auth, Edge Functions (Deno/TypeScript) for all custom business logic, Scheduled Functions/pg_cron for the 14-day inventory merge check
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth; role stored on the user's profile row, enforced via Row Level Security (RLS) policies
- Payments: Xendit (weekly disbursement, Fridays), triggered from an Edge Function
- Deployment target: Render (frontend static site) + Supabase (database, auth, functions) — there is no separate backend server to host

## Repository structure

Monorepo. Keep the existing `frontend/` landing page in place; add:
```
your-repo/
├── frontend/          → existing landing page + new role dashboards/pages
├── supabase/
│   ├── functions/       → Edge Functions (payment computation, discount lookup, merge job, etc.)
│   └── migrations/       → SQL schema migrations
├── docs/
│   ├── build-spec.md
│   └── requirements.md
├── seed/
│   └── pca_discount_table.sql
└── CLAUDE.md
```

---

## Non-negotiable business rules (must not be simplified or guessed differently)

These are the rules that got refined through review — build to these exactly, not to whatever seems "reasonable":

1. **Roles & accounts**: Supplier, Weigher, and Laboratory Staff self-register (`Pending` until Business Owner approves). Business Owner is seeded directly into the database — no public signup route for this role.
2. **Weigher flow**: on login, first screen is a choice — **Walk-in** or **Contractual** delivery. Walk-in has no contract link and is cash-settled, entirely outside payment processing.
3. **Negotiation**: Supplier submits a price/volume proposal via a "Propose Price" popup. Business Owner can **Accept**, **Decline**, or **Edit (counteroffer)**. Counteroffers loop back to the other party for their own Accept/Decline/Edit, until both sides accept. Once accepted, the contract auto-populates with the agreed price and volume — no manual re-entry.
4. **Moisture discount**: literal lookup table (`seed/pca_discount_table.sql`), not a formula. MC < 5.0% → 0% discount (best quality). MC > 20.2% → automatic Rejection, no payment.
5. **Payment pricing** depends on delivery timing vs. contract due date:
   - On time → use `contract.negotiated_price_per_kg`
   - Late → use `spot_price` (a single current value the Business Owner manually overwrites — no date history, always reads whatever it currently holds) — **and this automatically marks the contract `Breached`**, which feeds into the Supplier Rating calculation.
6. **Inventory — Walk-in vs. Resecada**: contractual accepted deliveries go straight into the main Resecada pool. Walk-in deliveries enter a separate **Walk-in Holding** pool. After 14 calendar days, a batch becomes `Ready to Merge` and the Business Owner is notified — **merging is never automatic**; the Business Owner must explicitly approve (or hold) each merge.
7. **Supplier Performance Rating**: computed only when a contract becomes `Completed` or `Breached`. Weighted formula: 60% Contract Fulfillment + 20% Delivered Volume + 20% Copra Quality (Moisture). Converts to a 1–5 rating. Overall Supplier Rating = average across all the supplier's completed/breached contracts.
8. **Notifications**: generated for contract events, delivery accept/reject, payment events, and all three inventory-merge stages (Pending, Ready, Completed).

Full detail on every rule above — including exact formulas, table schemas, and edge cases — is in `docs/build-spec.md`. If anything here seems to conflict with that file, `build-spec.md` wins.

---

## Suggested build order

Work in this order so each phase can be tested before the next depends on it:

1. **Supabase project setup**: create the project, set up the Supabase CLI locally, connect the repo.
2. **Database schema**: create all tables from `build-spec.md` §4 as SQL migrations, run the seed file for `pca_discount_table` and set up `spot_price`. Write Row Level Security (RLS) policies per role for each table.
3. **Auth**: Supabase Auth registration flows (Supplier/Weigher/Lab Staff), Business Owner seed script/manual insert, login, RLS policies tying access to the authenticated user's role.
4. **Negotiation & Contracts**: chat, Propose Price flow, Accept/Decline/Edit, contract auto-generation, e-signatures.
5. **Deliveries**: Weigher's Walk-in/Contractual choice, weighing records, Laboratory Staff's moisture entry + discount lookup.
6. **Payments**: computation logic (negotiated vs. spot price), weekly batching, Business Owner approval, Xendit integration, e-receipts.
7. **Inventory**: Resecada + Walk-in Holding pools, 14-day merge-eligibility flagging, Business Owner review/approve/hold.
8. **Supplier Rating**: computation trigger on contract completion/breach, dashboard ranking.
9. **Notifications**: all events listed in build-spec §5.
10. **Frontend dashboards**: one per role, wired to the backend above. Reuse/extend the existing landing page's design system rather than starting a new visual style.

## What NOT to build

- No literature review, legal/compliance boilerplate, or project-management artifacts from the original paper — see build-spec.md §6 "Out of Scope."
- Don't invent business rules not covered above or in build-spec.md — ask me instead of guessing.

---

## Before you start

Summarize back to me:
- Your understanding of the 4 roles and their core flows
- The payment computation (negotiated vs. spot price)
- The inventory merge rule
- Any open questions

Then begin with Phase 1.
