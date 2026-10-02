# Copilot instructions for CopTrax

## Commands

Run frontend commands from `frontend/`, except the root `npm run dev` shortcut:

```bash
npm run dev                         # from repo root; forwards to frontend Vite server
cd frontend && npm install
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm run preview
cd frontend && npm run lint
cd frontend && npx eslint src/pages/owner/InventoryPage.jsx  # lint one file
```

There is currently no configured unit-test runner or frontend test script, and no first-party frontend test files. Do not report a test-suite pass where none ran; use the focused ESLint command and production build to validate frontend changes.

Edge Functions use Deno with the shared import map and strict compiler options:

```bash
cd supabase/functions
deno check --import-map=import_map.json ai-faq/index.ts
```

Replace the function path to check another function. Local Supabase commands (Docker required):

```bash
supabase start
supabase db reset  # destructive to the local database; reapplies migrations and seed.sql
supabase db push
supabase functions deploy <function-name> --no-verify-jwt
```

## Architecture

- `frontend/` is a React 19 + Vite + React Router + Tailwind single-page app. `frontend/src/App.jsx` defines public routes and role-scoped dashboard routes; `ProtectedRoute` checks session, account status, and role, and role layouts render the appropriate pages.
- `AuthContext` owns Supabase session/profile state, role and account status, profile refresh, sign-out, and idle timeout behavior. The shared `AccountSettingsPage` is mounted under all role layouts. Use existing context and layout patterns rather than creating parallel auth or navigation state.
- `frontend/src/lib/supabase.js` creates the browser Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The frontend is a caller/presentation layer: business calculations and authorization belong in PostgreSQL/SQL or Edge Functions, not duplicated in React.
- `supabase/migrations/` is the ordered PostgreSQL source for schema, enums, RLS, RPCs, triggers, scheduled jobs, and backfills. Add a new timestamp/sequence migration; never edit or reorder an already-applied migration. `supabase/seed.sql` and `seed/pca_discount_table.sql` provide base/demo and PCA lookup data.
- `supabase/functions/<name>/index.ts` contains Deno Edge Functions; `_shared/` holds reusable auth, audit, pricing, and contract helpers. Functions commonly disable gateway JWT verification at deployment and perform their own caller/role checks. Follow the target function's existing verification and error-handling pattern.
- The procurement lifecycle crosses role routes and database logic: Supplier registration/BO verification → negotiation → contract generation/signing/BO approval → Weigher delivery recording → Lab quality inspection → allocation/payment/inventory → contract rating/reports. For end-to-end behavior, trace the database RPCs/triggers and RLS as well as the UI.

## Repository-specific constraints and conventions

- **Negotiation and chat are protected behavior.** Do not refactor or change chat/negotiation handlers, proposal/counteroffer conditions, sender/recipient rules, realtime subscriptions, contract creation side effects, or supporting queries unless the request names the specific behavior to change. A visual-only request permits presentation changes only; preserve props, state, callbacks, data flow, and side effects. See `CLAUDE.md` for the detailed protected areas and behaviors.
- **RLS is the security boundary.** Frontend role guards are for navigation/UX only. Every role-sensitive table or operation must have appropriate database RLS/privileges; do not treat hidden buttons or client-side filtering as authorization.
- **Preserve the agreed business rules; do not infer new ones.** Supplier-only self-registration and BO approval, BO-created staff, automatic contract deadlines/status transitions, per-delivery payments, explicit BO inventory merges, role-specific dashboards, and deadline-priority multi-contract allocation are defined in `CLAUDE.md` and the existing migrations. Ask if the requested behavior is ambiguous.
- **Use the PCA table as the source of truth.** Never replace the literal `seed/pca_discount_table.sql` lookup with a formula. Current boundary behavior is MC `< 5.0cc` → 0% deduction; `5.0cc` uses the table; MC `> 20.2cc` is rejected. Keep the lookup and final-weight/allocation behavior consistent with the latest migrations.
- **Delivery allocation and derived values are database-owned.** Contractual delivery allocation is atomic through `record_contractual_delivery()`; accepted final weight flows through `recompute_delivery_allocation()`. Reuse those mechanisms rather than calculating or reallocating contract/Spot portions in the browser. Keep `delivery_allocations` as the source for contract fulfillment and payment allocation where established.
- **Authorization and side effects should fail explicitly.** Use existing helpers such as `_shared/verify_caller.ts` and `_shared/audit_log.ts` where applicable. Do not silently ignore database, storage, payment, or audit errors or return a success-shaped fallback.
- **Supabase Storage is private for sensitive files.** Reuse existing `file_uploads` rows, bucket paths, RLS, and signed-URL patterns. Do not expose private documents through public URLs or trust client-provided user IDs for ownership.
- **Configuration and secrets:** frontend variables use the `VITE_` prefix and belong in `frontend/.env.local`; server secrets belong in Supabase Function secrets. Never commit credentials, `.env` files, or service-role keys.
- **Follow existing UI conventions.** Dashboard pages use the established cream/beige, brown, and deep-green design system and shared components. Keep user-facing UI responsive and consistent with its role layout.
- `README.md` and `CLAUDE.md` refer to `docs/requirements.md` and/or `docs/build-spec.md`, but those files are not currently present. Use checked-in `PRODUCT.md`, `CLAUDE.md`, migrations, and seed data as the available project references; do not invent requirements from the missing documents.
