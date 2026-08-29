# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Business Owner (NERC staff)** — the person running the copra trading operation. Uses the system daily to approve suppliers, negotiate contracts, review deliveries, release payments, manage inventory, and read performance reports. Typically older adult, not necessarily tech-native; works at a physical buying station across multiple locations in the region.

**Supplier (copra farmers and traders)** — individuals or groups who sell dried copra to NERC. Self-registers, negotiates price via chat, signs contracts digitally, tracks their deliveries and payment status. May be rural, on mobile, with variable connectivity.

**Weigher** — NERC staff at the station who weighs incoming deliveries. Needs a fast, focused form flow — walk-in or contractual. Does not manage finances or contracts.

**Laboratory Staff** — NERC staff who tests copra moisture content (cc) and PCA discount. Records inspection results that feed into payment calculation. Receives notifications when deliveries are queued for assessment.

Both the Business Owner and Supplier are equal primary users: the system only works when both sides are active.

## Product Purpose

CopTrax digitizes the full copra procurement cycle for NERC Copra Trading: supplier registration and verification → price negotiation via chat → contract signing → delivery recording and weighing → quality inspection → automated payment calculation → inventory management → supplier performance ratings → business reports. It replaces paper-based and fragmented manual processes with a single web system covering all four operational roles.

## Positioning

CopTrax is the only system purpose-built for Philippine copra trading that ties chatbased price negotiation, cryptographic contract signing, PCA moisture-discount lookup, and multi-contract delivery allocation into one workflow — rather than stitching together separate tools. The system knows the domain: it enforces the PCA discount table exactly, prices walk-in deliveries at spot rate, prices contractual deliveries at negotiated rate, and cascades excess delivery weight across active contracts to the next eligible one automatically.

## Operating Context

- **Physical stations** across the Zamboanga del Sur region; staff use desktop/laptop; suppliers may use mobile
- **Key workflows:** supplier self-registration with AI-assisted ID OCR → BO approval → chat negotiation → contract generation + signing → weigher records delivery → lab inspects moisture → BO releases payment (Xendit bank transfer) → inventory batch management → performance snapshots on contract completion or breach
- **Domain terminology in use:** MC (moisture content in cc), PCA Discount (%), Spot Price (₱/kg), Negotiated Price, Contractual vs Walk-in delivery, Resecada, Breach, Fulfillment %, Sacks Deduction
- **Scheduling:** contracts have a fixed deadline (activation date + 1 month + 1 day); breach and merge checks run via pg_cron

## Capabilities and Constraints

- React + Vite + Tailwind frontend; Supabase (Postgres, Auth, Edge Functions, Realtime, Storage) backend
- Payments via Xendit (sandbox/test mode); contract signing is in-house cryptographic (SHA-256 + pdf-lib)
- ID OCR via Google Gemini Vision (extract-id-info Edge Function)
- PCA discount is a literal lookup table (seed/pca_discount_table.sql) — never a formula
- MC > 20.2 cc → automatic rejection, no payment; MC < 5.0 cc → 0% discount
- All business logic lives in Edge Functions or SQL (RLS), never client-side
- Dark mode and compact tables are user-level preferences stored in localStorage keyed by user ID
- School thesis / capstone project context; not yet in production

## Brand Commitments

- Product name: **CopTrax**
- Business name: **NERC Copra Trading**
- Primary brand color: deep green (`#1b5e20` / `green-dark`)
- Warm cream/beige background palette (`#faf6ee` / `#e8dcc8`)
- Poppins typeface throughout
- Logo: coconut palm illustration (BrandLogo component)

## Evidence on Hand

- Full working codebase at `frontend/src/`
- Supabase schema migrations in `supabase/migrations/`
- Contract template at `docs/contract_template.docx`
- PCA discount table at `seed/pca_discount_table.sql`
- No real user testimonials, benchmarks, or production usage data

## Product Principles

1. **Domain accuracy over abstraction** — every calculation, label, and workflow must match Philippine copra trading practice exactly (PCA table, cc not %, sacks deduction, cascade allocation).
2. **Role clarity** — each of the four roles sees only what they need; no shared dashboards, no feature bleed.
3. **Trust through transparency** — suppliers and business owner can always trace how a price, payment, or rating was calculated.
4. **Resilience over clever** — business logic lives in the database and Edge Functions, not the browser; the UI is a thin presentation layer.
5. **Accessible to non-technical users** — the system serves older adults at physical stations; legibility, directness, and predictable flows matter more than novelty.

## Accessibility & Inclusion

Older adult users on the Business Owner side; rural mobile users on the Supplier side. Legibility (larger text, sufficient contrast) and simple navigation take precedence over density.
