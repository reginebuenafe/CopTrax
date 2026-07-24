# CLAUDE.md

This file is read automatically at the start of every session in this repo. Keep it in sync with `docs/build-spec.md` — if they conflict, `docs/build-spec.md` wins.

## Project

**CopTrax** — a web-based procurement management system for NERC Copra Trading. Digitizes: negotiate price → sign contract → deliver → weigh → test quality → compute payment → manage inventory. Four roles: **Business Owner**, **Supplier**, **Weigher**, **Laboratory Staff**.

Full spec: `docs/build-spec.md` (authoritative). Background/original SRS: `docs/requirements.md` (reference only — don't build from it if it conflicts with build-spec.md).

## Tech stack

- Frontend: React.js, deployed on Render (Static Site)
- Backend: **Supabase** — Postgres database, Supabase Auth (login/roles), Edge Functions (Deno/TypeScript) for custom business logic, pg_cron/Scheduled Functions for the 14-day inventory merge check
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth, with role stored in a `profiles`/`users` table and enforced via Row Level Security (RLS) policies — not custom JWT middleware
- Payments: Xendit (weekly disbursement, Fridays), triggered from an Edge Function
- Deployment: Render (frontend static site) + Supabase (database, auth, functions) — no separate backend server host

## Repo structure

```
frontend/          → landing page + role dashboards
supabase/
  functions/        → Edge Functions (business logic: payment computation, discount lookup, merge job, etc.)
  migrations/        → SQL schema migrations
docs/
  build-spec.md
  requirements.md
seed/
  pca_discount_table.sql
```

## Commands

```
supabase start                          # run Supabase locally (Docker)
supabase db push                        # apply migrations to remote project
supabase functions deploy <name>        # deploy an Edge Function
psql $SUPABASE_DB_URL -f seed/pca_discount_table.sql   # seed moisture discount table + spot_price table
```

## Non-negotiable business rules

Do not simplify, "improve," or guess differently on these — they were deliberately refined:

1. **Roles**: Supplier, Weigher, Laboratory Staff self-register (`Pending` until Business Owner approves). Business Owner is seeded directly in the DB — no public signup route.
2. **Weigher**: first screen after login is a choice — **Walk-in** or **Contractual**. Walk-in has no contract link, cash-settled, excluded from payment processing entirely.
3. **Negotiation**: Supplier submits price/volume via "Propose Price" popup. Business Owner can Accept / Decline / Edit (counteroffer). Counteroffers loop back to the other party until both accept. Contract auto-populates from the accepted proposal — no manual re-entry.
4. **Moisture discount**: literal lookup table (`seed/pca_discount_table.sql`), never a formula. MC < 5.0% → 0% discount. MC > 20.2% → automatic Rejection, no payment.
5. **Payment price**: on-time delivery → `contract.negotiated_price_per_kg`. Late delivery → `spot_price` (single current value, Business Owner overwrites manually, no date history) **and automatically marks the contract `Breached`**.
6. **Inventory**: contractual accepted deliveries → straight into Resecada pool. Walk-in deliveries → separate Walk-in Holding pool. After 14 calendar days, batch flips to `Ready to Merge` and Business Owner is notified. **Merge is never automatic** — Business Owner must explicitly approve or hold each one.
7. **Supplier Rating**: computed only on contract `Completed`/`Breached`. 60% Contract Fulfillment + 20% Delivered Volume + 20% Copra Quality → 1–5 rating. Overall rating = average across the supplier's contracts.
8. **Notifications**: contract events, delivery accept/reject, payment events, and all three inventory-merge stages (Pending, Ready, Completed).

## Hard constraints

- No business logic belongs in the frontend beyond calling Supabase — all computation (payment, discount lookup, rating, merge eligibility) lives in Edge Functions or SQL, never client-side.
- Role-based access is enforced via Postgres Row Level Security (RLS) policies, not just app-layer checks — every table with role-sensitive data needs an RLS policy, not just a frontend guard.
- Don't invent business rules not in `docs/build-spec.md` — ask instead of guessing.
- Don't build anything from `docs/build-spec.md` §6 "Out of Scope" (literature review, legal/compliance boilerplate, project-management artifacts).
- Reuse the existing landing page's visual design system for new dashboard pages rather than introducing a new style.

## Workflow preference

Build and review one module at a time (see build order in the original kickoff prompt / build-spec.md §3). Don't build multiple unrelated modules in one pass.
