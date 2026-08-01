<div align="center">

# CopTrax

**Procurement Management System for NERC Copra Trading**

A full-stack web application that digitizes the end-to-end copra procurement workflow — from supplier registration and price negotiation to contract management, delivery tracking, quality testing, payment processing, inventory management, and reporting.

Set in Kumalarang, Zamboanga del Sur, Philippines.

</div>

---

## Preview

> Live demo coming soon.

![Preview](https://img.shields.io/badge/demo-coming%20soon-lightgrey?style=flat-square)

---

## Tech Stack

<div align="center">

![React](https://img.shields.io/badge/React-20232a?style=for-the-badge&logo=react&logoColor=61DAFB)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=react-router&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)

</div>

---

## Roles

| Role | Access |
|---|---|
| **Business Owner** | Full system access — verifies suppliers, negotiates contracts, oversees deliveries, manages inventory, views reports |
| **Supplier** | Self-registers, proposes prices, monitors contracts and deliveries, views payment history |
| **Weigher** | Records walk-in and contractual deliveries with weight data |
| **Laboratory Staff** | Records moisture content and quality test results per delivery |

---

## Repo Structure

```
frontend/           → React + Vite frontend (landing page + role dashboards)
supabase/
  functions/        → Edge Functions (Deno/TypeScript)
    check-merge-eligibility/
    create-contract/
    create-staff-account/
    process-payment/
    upload-registration-files/
  migrations/       → Ordered SQL migrations
  seed.sql          → Base seed data
supabase/config.toml → Local Supabase config
seed/
  pca_discount_table.sql  → Moisture content discount lookup table
docs/
  build-spec.md     → Authoritative feature spec (source of truth)
  requirements.md   → Background SRS reference
```

---

## Prerequisites

Make sure these are installed before proceeding:

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v9 or later (comes with Node)
- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.x or later
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (required for local Supabase)
- A [Supabase](https://supabase.com) account (for remote/production deployment)
- A [Xendit](https://www.xendit.co/) account (for payment processing)

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/reginebuenafe/CopTrax.git
cd CopTrax
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Configure environment variables

Create `frontend/.env.local` with your Supabase project credentials:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
```

> For local development, the URL and anon key are printed by `supabase start` (see step 4).

### 4. Start Supabase locally

Make sure Docker Desktop is running, then from the project root:

```bash
supabase start
```

This will:
- Spin up a local Postgres database (port `54322`)
- Start the Supabase API server (port `54321`)
- Open Supabase Studio at `http://127.0.0.1:54323`
- Start the local email testing UI at `http://127.0.0.1:54324`

> Copy the printed `anon key` and `API URL` into `frontend/.env.local`.

### 5. Apply database migrations

```bash
supabase db push
```

This runs all migration files in `supabase/migrations/` in order, creating all tables, functions, triggers, RLS policies, and pg_cron jobs.

### 6. Seed the database

```bash
# Seed the moisture content discount table and spot price
psql $SUPABASE_DB_URL -f seed/pca_discount_table.sql
```

> `$SUPABASE_DB_URL` is printed by `supabase start`. It looks like:  
> `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

To also run the base seed (demo data):

```bash
supabase db reset
```

> `db reset` re-applies all migrations and then runs `supabase/seed.sql` automatically.

### 7. Seed the Business Owner account

The Business Owner account is **not** self-registered — it must be seeded directly into the database. Run the following against your local Supabase instance via Supabase Studio's SQL editor or psql:

```sql
-- See supabase/create_business_owner.sql for the full script
\i supabase/create_business_owner.sql
```

### 8. Start the frontend dev server

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Deploying Edge Functions

Deploy individual Edge Functions to your remote Supabase project:

```bash
supabase functions deploy check-merge-eligibility
supabase functions deploy create-contract
supabase functions deploy create-staff-account
supabase functions deploy process-payment
supabase functions deploy upload-registration-files
```

Or deploy all at once:

```bash
for fn in check-merge-eligibility create-contract create-staff-account process-payment upload-registration-files; do
  supabase functions deploy $fn
done
```

---

## Production Deployment

### Frontend — Render

1. Push the repository to GitHub.
2. Create a new **Static Site** on [Render](https://render.com).
3. Set the **Root Directory** to `frontend`.
4. Set **Build Command** to `npm run build`.
5. Set **Publish Directory** to `dist`.
6. Add the environment variables:
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

### Backend — Supabase (Remote Project)

1. Create a project on [supabase.com](https://supabase.com).
2. Link your local repo to the remote project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
3. Push migrations:
   ```bash
   supabase db push
   ```
4. Seed the discount table:
   ```bash
   psql $SUPABASE_DB_URL -f seed/pca_discount_table.sql
   ```
5. Deploy Edge Functions (see above).
6. Seed the Business Owner account via the Supabase Dashboard SQL editor.

---

## Available Scripts

Run these from inside the `frontend/` directory:

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server at `http://localhost:5173` |
| `npm run build` | Build for production (output to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the frontend source |

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | `frontend/.env.local` | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local` | Supabase anon/public key |

> Never commit `.env.local` or any file containing secrets. It is already in `.gitignore`.

---

## Key Business Rules

- **Supplier self-registration** requires: first name, last name, email, contact number, password, government-issued ID upload, and e-signature upload. Accounts start as `Pending Verification` until approved by the Business Owner.
- **Weigher and Laboratory Staff** accounts are created directly by the Business Owner — no self-registration.
- **Contract deadlines** are auto-computed: `activation_date + 1 month + 1 day`. Never manually entered.
- **Moisture content discounts** are looked up from a static table (`seed/pca_discount_table.sql`), never calculated with a formula. MC > 20.2% → automatic rejection.
- **Payments** are per-delivery. Contractual deliveries use the negotiated contract price; non-contract and walk-in deliveries use the current spot price.
- **Inventory merges** are never automatic — the Business Owner must explicitly approve each one after the 14-day holding period.

See `docs/build-spec.md` for the full authoritative specification.

---

<div align="center">

## Author

**Regine Christian Buenafe**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/reginebuenafe)
[![Gmail](https://img.shields.io/badge/Gmail-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:rchristianbuenafe@gmail.com)

---

![Made with](https://img.shields.io/badge/Made%20with-React%20%2B%20Vite-blue?style=flat-square)
![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=flat-square)
![Tailwind](https://img.shields.io/badge/Styled%20with-Tailwind%20CSS-06B6D4?style=flat-square)

</div>
