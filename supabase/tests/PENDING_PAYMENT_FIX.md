# Pending supplier payments: database review step

## Confirmed cause (read-only live inspection, 2026-10-16)

Cause 1: no payment record is created until the BO creates a payment batch.
`create_payment_batch` inserts a Pending header, details and delivery links.
The subsequent payout/finalization flow updates that header to Processing and
Released; it does not create the first payment record at completion.

Supplier `6642c109-eb7f-4984-92f1-d4dcba699e04` had one Completed contract,
two Accepted contractual deliveries with NULL payment_id, and zero payments.
The same results were verified in a READ ONLY transaction with ROLE
authenticated and request.jwt.claim.sub set to that supplier's ID.

There is no completed-only filter or inner join in SupplierPaymentsPage.
Live payments_select allows supplier_id = auth.uid() for all statuses.
payment_details_select follows the owning payment; contract and delivery
SELECT policies also allow the affected supplier's records. No RLS edit is needed.

## Exact database change

Review `../migrations/20261016000089_pending_payments_on_delivery_acceptance.sql`.
It is one atomic migration containing:

- Internal `payable_delivery_payment_lines(UUID)`: the BO's existing eligibility,
  allocation/quantity/pricing formulas, cent rounding and Friday schedule.
- Internal `ensure_pending_delivery_payment(UUID)`: locks eligible deliveries,
  groups by supplier/owner/payment Friday, and calls existing create_payment_batch.
  It never merges into or changes an existing payment batch.
- Delivery-status and quality-result acceptance triggers. Quality results are
  handled after the existing final-weight allocation trigger. Pending creation
  also works if the quality result arrives after the delivery status change.
- A payment_details trigger that locks the delivery reference and rejects its
  inclusion in a different payment. Multiple allocations in the SAME payment
  remain valid; UNIQUE(delivery_id) on payment_details would incorrectly reject
  that existing format. Stale batch inserts roll back atomically.
- An idempotent backfill. Its SELECT reports created_pending_payments and
  backfilled_deliveries. Repeating it creates zero additional records.

No tables, columns, enums, policies or existing functions are changed.
The new helper functions are not executable by PUBLIC, anon or authenticated.
Existing release, payout webhook, receipt, correction and contract logic remains
in place. Allocation weights are already final; no second PCA deduction occurs.
Spot pricing uses the same source and creation-time pricing as the BO batch code.

## Live backfill preview (not applied)

A READ ONLY query using the migration's exact pricing SELECT predicted:

- 4 Pending payment batches linking 9 eligible unpaid deliveries.
- Total: PHP 1,294,757.14 at the spot price in effect during inspection.
- Affected supplier above: 1 batch, 2 deliveries, PHP 87,180.00.

**No live Pending records have been created by this change yet.** The migration
is prepared for review before application. Applying it creates real payout
records, which the existing Friday auto-release job can process, including
batches whose scheduled payment week is already in the past. The preview can
change if deliveries, payment batches or the spot price change before application.
Do not push unrelated pending migrations as part of this step.

## Verification

From the repository root:

```powershell
npm exec --yes --package=@electric-sql/pglite -- node supabase/tests/pending_payments_on_acceptance.mjs
```

The test executes the migration in an isolated PostgreSQL engine with the actual
table definitions, constraints, RLS, payment-batch writer, completion trigger and
payout finalizer from schema.sql. It reproduces the affected delivery quantities,
checks against the BO's actual JavaScript calculation functions, verifies one
Pending batch with three allocation lines, idempotent backfill, unchanged paid
records, supplier isolation, no-payable empty state, rejection/walk-in exclusion,
Friday cutoff, duplicate prevention and completion of the SAME payment row.
Hosted concurrency and real payout submission are not exercised by these tests.

From frontend:

```powershell
npm exec --yes --package=playwright-core -- node tests/supplierPayments.browser.mjs
```

The real Supplier Payments component is tested with local HTTP/auth fixtures for
Pending/Completed display, amounts, references, dates, receipts, status transition
on reopen, supplier-scoped requests, empty states and widths 320/380/1280px.
The page retains its existing fetch-on-open behavior; it has no realtime payment
subscription. The database completion status remains Released; its supplier-facing
badge now says Completed. Paid dates are shown only for completed payments.
