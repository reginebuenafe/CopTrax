# First-time supplier pricing

Current rule, clarified by the user: **zero contracts of any status means a
first-time supplier. They CAN submit an initial price proposal. Only their
Counter action on a received offer is disabled.** Accept, Decline/Reject, text
messages, and existing active-contract limits retain their behavior.

## Discovery before implementation

- The stored reference is `public.spot_price.price_per_kg`. The Business Owner
  sets it in `src/pages/owner/OwnerOverview.jsx`, in `saveSpotPrice()` (updates
  existing rows or inserts when empty). Offers store their own price in
  `proposal_forms.proposed_price_per_kg`; a manual offer is not dynamically
  tied to later spot-price changes.
- The only frontend proposal INSERT is in `src/components/ProposePriceModal.jsx`.
  It inserts directly through Supabase with `supplier_id`, `submitted_by`,
  price, volume, conversation ID, and optional `supersedes_proposal_id`.
  Both supplier views and the BO counter flow use this modal. Accept/reject
  actions use existing updates/RPC/contract generation rather than this insert.
- Supplier entry points: `NegotiationChatWidget` has an empty-state Submit Price
  Proposal action, a footer proposal button, incoming-card Counter, and saved
  modal state. `SupplierChatLayout` has a header Propose Price action,
  empty-state Submit Price Proposal, footer Propose Price, incoming-card Counter,
  and saved propose/counter modals. The shared modal also needs its own check.
- `BOChatLayout` only opens counters. Migration 023, retained in the later
  hardened `proposals_insert` policy (064), permits BO inserts only with a
  superseded proposal. `ai-negotiate` also starts from a supplier proposal and
  inserts counters as `submitted_by = conversation.business_owner_id`.
- AI pricing uses `_shared/negotiation_pricing.ts`: recommended price = stored
  spot price + the rating-band premium. An unrated supplier gets zero premium.
  `ai-faq` sends text, not offers. Neither AI function was changed.
- `SupplierOverview` uses rounded cards and a spot-price badge. Existing notices
  use `bg-green-pale/60`, `border-green-mid/20`, `rounded-xl`, and brown text.
  New elements reuse those Tailwind tokens and `LuInfo`/`LuX` from react-icons/lu.
  Green, beige, brown, cream, and the existing Poppins font remain unchanged.

First-time suppliers initiate through the same proposal flow as other suppliers.
BO/AI counter-only behavior therefore still works without an initial-offer
policy change. No spot-price source was created or offer price changed.

## Runtime files

| File | Change |
| --- | --- |
| `src/hooks/useIsFirstTimeSupplier.js` (new) | Single shared hook for supplier eligibility and BO display. Returns loading/error, count, spot price, first-time flag, `canSubmitProposal` (verified history, including zero), `canCounter` (at least one contract), and refresh. Rechecks on mount, widget opening, and conversation change. Each consumer waits for its own fresh result; opening the modal does not unmount it through a shared loading loop. |
| `src/utils/supplierPricing.js` (new) | Shared per-supplier observable cache and exact notice text. Counts `contracts` by `supplier_id` with **no status filter**; stale responses cannot overwrite newer refreshes. A failed count does not grant negotiation access. Reads the existing spot source, falling back to offer price if absent. |
| `src/components/FirstTimePricingNotice.jsx` (new) | Reusable chat/dashboard notice with a close button and offer spot-basis label. Dismissal is held in memory for the current page load, keyed by user and chat/dashboard scope. It survives component remounts and returns after reload; old localStorage dismissal values are ignored. |
| `src/hooks/useChatEntryScroll.js` (new) | Shared scrolling for the two supplier chats: reveal the top of the newest visible message/card instead of the bottom of reserved typing slots, preserve older-history reading, resume following on send, and maintain alignment across pane/card resizing. Uses entry markers and only enough trailing space to make top alignment possible. |
| `src/components/NegotiationChatWidget.jsx` | Proposal actions are visible and enabled for verified first-time suppliers. Incoming-card Counter stays visible but disabled for them, with an explanation. Separate guarded open handlers clear only persisted counter modals, preserving saved initial proposals. Includes spot basis and pinned notice. Its existing `chat_widget_contracts:<supplier id>` subscription refreshes the shared check. |
| `src/pages/supplier/SupplierChatLayout.jsx` | Same proposal/counter permissions and saved-modal behavior. Existing conversation channel contracts INSERT/UPDATE callbacks refresh the shared check. Existing active-contract limits still apply. Chat is anchored below the supplier header; the message list and desktop contract panel scroll internally. Modals render in the body above the app header. |
| `src/components/ProposePriceModal.jsx` | Supplier-only loading/restriction guard plus a fresh contract-history check immediately before inserting. Zero contracts is permitted for initial proposals; counters are blocked. Both `isCounter` and non-null `supersedesId` identify a counter, covering direct/stale modal access. BO submissions retain their existing insert path. |
| `src/pages/supplier/SupplierOverview.jsx` | First-time-only dismissible How pricing works card. The existing dashboard widget's contracts subscription updates the shared store, so this notice also disappears when the first contract arrives. |
| `src/pages/owner/BOChatLayout.jsx` | Display-only First-time supplier badge using the shared hook. Existing contracts UPDATE and an INSERT listener on the same channel refresh the badge. Offer creation unchanged. |

Message sending/receiving, ordering, read state, notifications, contract
generation/signing, delivery/payment, AI, typing indicators, global styles,
and existing Accept/Reject handlers were not edited.

## Separate server guard — review/deploy independently

Migration `20261015000087_first_time_supplier_proposal_guard.sql` originally
created `guard_first_time_supplier_proposal()` and its own
`aa_first_time_supplier_proposal_guard` BEFORE INSERT trigger on proposal_forms.
Its original scope also blocked initial proposals.

The correction is a separate migration:
`supabase/migrations/20261015000088_allow_first_time_supplier_initial_proposals.sql`.
It replaces only that guard function, returning immediately for initial offers
(`supersedes_proposal_id IS NULL`). Existing RLS, tables, other functions, and
the trigger itself are unchanged. Keep 087 in migration history and apply 088
after it; do not reapply only the old guard from 087.

- Authenticated suppliers are checked using `auth.uid()` and the existing role
  helper, so spoofing `submitted_by` does not bypass the rule.
- Zero contracts of **any** status blocks only counters, with error `42501`:
  first-time suppliers can submit price proposals, but cannot counter an offer
  and may accept/decline received offers. Initial proposals are allowed.
- BO counters and service-role AI counters remain allowed by this guard;
  supplier accept/reject UPDATEs do not run it. Existing RLS and other guards
  still decide whether any otherwise eligible request is permitted.
- Both migrations were tested in an isolated PostgreSQL engine. **The correction
  in 088 has not been applied to the live Supabase project by the agent.** If 087
  is already installed, it will still reject first-time initial proposals until
  088 is applied. The dumped schema includes the original guard.

## Verification and test files

No test reads/writes live application data or changes the package manifest.

| New file | Purpose / command from `frontend` |
| --- | --- |
| `tests/supplierPricing.test.mjs` | Cache/history/failure/race tests: `node --test tests/supplierPricing.test.mjs tests/chatTyping.test.mjs`. |
| `tests/supplierPricing.mock.js` | In-memory table/channel/edge adapter; records requests and simulates contract events. |
| `tests/supplierPricing.fixture.jsx` | Actual supplier widget/full chat, dashboard, BO chat, and shared modal with isolated identities and storage. |
| `tests/supplierPricing.browser.mjs` | Headless Edge checks: `npm exec --yes --package=playwright-core -- node tests/supplierPricing.browser.mjs`. |
| `tests/supplierPricing.guard.mjs` | Executes the actual migration in in-memory PostgreSQL: `npm exec --yes --package=@electric-sql/pglite -- node tests/supplierPricing.guard.mjs`. |
| `tests/FIRST_TIME_SUPPLIER_PRICING.md` | Discovery, implementation inventory, guard boundary, and verification record. |

Verified:

- Zero history enables initial proposal controls in both supplier chats; notices
  and spot basis appear. Counter is visible and disabled. Controls wait for
  eligibility while loading. Accept and Decline/Reject keep their existing
  handlers. Text sends still work.
- Saved counter modals are cleared; saved initial proposal modals remain usable.
  Direct first-time initial proposals work. Direct counter access has no form;
  a stale experienced counter modal rechecks and cannot insert after its fixture
  history changes to zero.
- Cancelled and Breached histories enable Counter as well as Propose Price; unit and
  PostgreSQL checks also cover Pending, Active, Completed, and arbitrary status.
- An existing contracts INSERT event enables Counter and removes first-time notices and BO
  badge without reload. Both chat and dashboard notices can be dismissed until
  page reload. Missing spot source shows the offer's own price.
- 380px widget and full chat have no horizontal document overflow; screenshots
  are saved under ignored `tests/artifacts/first-time-*-380.png`.
- New messages and cards align at their top in both supplier chats, including
  tall content. A supplier reading older messages is not interrupted; sending
  resumes following. Pane/font-size changes and notice dismissal preserve the
  alignment. The full chat's proposal card is now up to 384px wide (previously
  320px), with mobile width bounds and a wrapping card header.
- `tests/chatScroll.browser.mjs` exercises entry alignment, resizing, older
  history, sending, card width, and notice close/reload/remount behavior with
  local fixtures. Run with `npm exec --yes --package=playwright-core -- node tests/chatScroll.browser.mjs`.
- Corrected migration permits initial supplier proposals with zero contracts,
  rejects first-time counters including spoofed submitters, and ignores history
  belonging only to another supplier. All history statuses permit counters;
  BO/service AI counters and accept/reject updates remain allowed.
- Targeted ESLint and production build pass. The build still reports the existing
  Node 20.17 version warning (Vite asks for 20.19+ or 22.12+) and large bundles.
- The existing two-session `chatTyping.browser.mjs` regression passed with real
  Realtime broadcasts: bidirectional named typing, self-suppression, disconnect
  expiry, conversation switching, simultaneous human/AI activity, AI
  success/error/timeout, mobile/dark/reduced-motion, and mirrored indicators.
  Neither the regression files nor production typing/AI code were changed.

Live authenticated buyer/supplier and deployed-policy smoke tests, actual
contract/PDF generation, images, and notifications still need verification in
the application's test environment. Fixtures intercept these effects. Account
emails alone do not supply an authenticated session, and the new migration has
not been deployed. The separate existing chat browser regression exercises real
Realtime broadcasts with fixture messages/AI responses, rather than real accounts.
