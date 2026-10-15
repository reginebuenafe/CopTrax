# Chat typing and thinking indicators

## Human typing repair

The primary reproduced failure was category **3 (subscription readiness)**:
the input handler ran while `subscribed` was false, discarded the update, and
never replayed it when the channel became ready. Temporary send, receive, and
render logs confirmed the break: input/false-ready → SUBSCRIBED → no receiver
event → inactive human indicator. After repair the same delayed-ready test
produced input/false-ready → SUBSCRIBED → receiver event → active named bubble.
The logs were removed after confirming the path.

Additional human-only failures were addressed:

- Category **3 (filter)**: the receiver required `session_id`, rejecting valid
  typing signals containing only the documented conversation/sender/name or role
  and typing flag. Tab IDs are now optional and visible typers aggregate by
  sender ID. Incoming signals during the ready-callback window are buffered.
- Category **5 (state lost)**: AI replies use the owner's sender ID. The previous
  arrival handler removed the owner's human typing entry on an AI reply. A
  failing regression reproduced this; only human messages now clear human typing.
- Category **6 (rendering concurrent activity)**: a shared human/AI bubble meant
  there was no separate human bubble during AI activity. Each side now keeps an
  independent human slot before the existing AI slot, using `TypingIndicator`
  and the same bubble classes. AI request logic, signals, timings, and appearance
  are unchanged.

Files changed for this repair (no new source files):

| File | Human typing repair |
| --- | --- |
| `src/utils/chatTyping.js` | Retain recent input until subscription readiness; buffer early receive events; accept optional tab IDs; aggregate typers by sender; preserve human typing across AI replies. Existing 1.5s throttle, 2.5s idle stop, and 5s receiver expiry remain. |
| `src/pages/owner/BOChatLayout.jsx` | Render human and AI activity independently with the existing sender-side rule and named labels. |
| `src/pages/supplier/SupplierChatLayout.jsx` | Same independent rendering on each existing side. |
| `src/components/NegotiationChatWidget.jsx` | Same independent rendering in the compact list. |
| `tests/chatTyping.test.mjs` | Add readiness, early-receive, optional-tab-ID, and shared-owner-ID regressions; retain AI lifecycle tests. |
| `tests/chatTyping.browser.mjs` | Add delayed-ready input, conversation switching, and simultaneous human/AI tests including human typing across an AI reply. |
| `tests/chatTyping.mock.js` | Test-only readiness delay and conversation switching; allow enough fixture response time to verify both indicators. |
| `tests/chatTyping.fixture.jsx` | Match application Strict Mode and provide a test-only conversation switch button. |
| `tests/CHAT_TYPING_CHECKS.md` | Record diagnosis, repairs, and verification. |

`TypingIndicator.jsx` and its CSS are unchanged after temporary logging was
removed. `useChatTyping.js`, `chatAiActivity.js`, and `aiFaq.js` were not changed
for this repair. The tables below describe the original implementation as well.

## Inventory and sender-side rules

The inventory was completed before editing. Searches covered chat/conversation
filenames, message-list renders, send handlers, sender IDs, AI invocations,
message inputs, and Realtime subscriptions throughout `frontend/src`.

| Component | Existing side rule | Result |
| --- | --- | --- |
| `src/pages/owner/BOChatLayout.jsx` | `msg.sender_id === user.id` is right; other senders are left. AI writes with the conversation's business-owner ID, so it is right for that owner and left for another viewer. | Updated: human typing, named labels, AI thinking, reserved slots, list scrolling. This is the thread used by both owner conversation routes. |
| `src/pages/supplier/SupplierChatLayout.jsx` | `msg.sender_id === user.id` is right; owner and AI messages are left. | Updated: human typing, AI thinking, named labels, reserved slots, list scrolling. |
| `src/components/NegotiationChatWidget.jsx` | `m.sender_id === user?.id` is right; owner and AI messages are left. | Updated: the same shared indicator and signals; list-only scrolling keeps the compact popup visible. |
| `src/pages/owner/BOConversationsPage.jsx` | No message sides: it renders conversation previews only. | Unchanged. It has no thread, composer, send handler, or Realtime channel. `App.jsx` routes conversations to `BOChatLayout`, not this page. |

No other message threads were found. Proposal/contract dialogs, notification
components, and the Help/Support contact links are not message threads and were
excluded. The AI negotiation assistant and FAQ assistant both reply within the
three threads above; neither has a separate chat component.

Each thread explicitly filters activity using its existing sender-ID rule and
passes `side` to `TypingIndicator`. The shared component has no sender logic.
Human signals from the viewer's own user ID are ignored, including signals
from another tab logged in as that user. AI activity retains the business-owner
sender identity used by stored AI replies. Human typers on each side share one
bubble, independently of the existing AI bubble;
labels name one or two people, or say "Several people are typing…".

## Files changed

| Existing file | Modification |
| --- | --- |
| `src/pages/owner/BOChatLayout.jsx` | Attach typing listeners to the existing selected-thread channel, send signals from composer/quick-action edits, stop on submit/blur, observe the existing `ai-negotiate` request, render side-specific indicators, scroll the message list for activity. |
| `src/pages/supplier/SupplierChatLayout.jsx` | Attach typing and AI listeners to existing thread/presence channels, send composer/quick-action signals, stop on submit/blur, render indicators using existing bubble colors and sides, scroll for activity. |
| `src/components/NegotiationChatWidget.jsx` | Same thread/presence signals and indicator; stop on closing; scroll its message-list container directly and constrain the flex list with `min-h-0`. |
| `src/utils/aiFaq.js` | Observe the existing request promise for UI activity. Request body, abort behavior, duplicate guard, logging, response handling, and backend reply insertion are unchanged. |

## New files

| File | Purpose |
| --- | --- |
| `src/components/TypingIndicator.jsx` | Shared human/AI indicator, optional label, caller-supplied side and bubble classes, `role="status"`, `aria-live="polite"`, and hidden accessible text. |
| `src/components/TypingIndicator.css` | Component-scoped pill, three sequential opacity dots, mirrored circular tail, fixed 64px slot, fade, and static reduced-motion rendering. Uses inherited colors; changes no global styles. |
| `src/hooks/useChatTyping.js` | React subscription to ephemeral activity via `useSyncExternalStore`. |
| `src/utils/chatTyping.js` | Existing-channel binding, human broadcast throttling, stop/expiry timers, self/conversation filtering, AI broadcast reception, activity labels, and lifecycle cleanup. |
| `src/utils/chatAiActivity.js` | UI-only observation of existing AI promises, cleanup on completion/rejection/20-second safety timeout, and optional broadcast over an already-open owner presence channel. |
| `tests/chatTyping.test.mjs` | Deterministic lifecycle/transport tests with a fake clock. |
| `tests/chatTyping.browser.mjs` | Headless browser tests that render the actual three chat components in isolated browser contexts and use real Supabase broadcasts. |
| `tests/chatTyping.fixture.jsx` | Test-only entry for the actual chat views. |
| `tests/chatTyping.fixture.html.template` | Test HTML served only by the browser runner; excluded from the ordinary Vite HTML entry scan. |
| `tests/chatTyping.mock.js` | Isolated test identities and table/API fixtures; only broadcasts use the real network. |
| `tests/.gitignore` | Ignore generated browser screenshots and verification artifacts. |
| `tests/CHAT_TYPING_CHECKS.md` | This inventory, implementation, verification, and review report. |

No backend, migration, stored-message format, business rule, palette, font,
global stylesheet, notification logic, or unrelated page was changed. Existing
message inserts, deduplication, ordering, proposal/contract actions, and read
status paths remain in place. Package manifests and the lockfile are unchanged
by this task; temporary browser tooling is kept outside application dependencies.

## Broadcast protocol

The existing selected-thread channels now share the topic
`coptrax:chat:<conversation_id>` across the owner, supplier, and widget views.
Their existing Postgres listeners/filters remain on those channels. No extra
human-typing channel is created.

Human broadcasts use event `typing` with this ephemeral payload:

```js
{
  conversation_id,
  sender_id,
  name,
  role,
  session_id, // distinguishes tabs for the same remote participant
  typing: true // false when stopped
}
```

Active signals are limited to one per 1.5 seconds, including rapid clear/restart.
Stop is sent after 2.5 seconds without input, or immediately on clear, submit,
blur, hidden tab, widget close, page exit, or teardown. Receivers expire missing
updates after 5 seconds. Realtime error/close/timeout clears local displayed
activity. Recent input is retained during join and sent only once subscribed;
idle, blur, clear, or teardown cancels queued input. Delivery errors never block
message sending. Human message arrival dismisses that sender's typing state;
an AI reply with the same owner ID does not. Message text is never included in
signals.

AI broadcasts use `ai_thinking`, with conversation ID, business-owner sender ID,
request ID, session ID, and a `thinking` boolean. Receivers also enforce the
conversation filter and five-second expiry. Pending requests send a heartbeat
every 1.5 seconds. The indicator clears on an AI reply, promise completion,
rejection, or a 20-second UI safety timeout; the observer does not change or abort
the original request. The FAQ helper's existing 20-second abort remains intact.

When an owner launches negotiation AI from the conversation-list subscription
while viewing another thread, the observer uses the already-open
`coptrax:presence:business-owners` channel from `OwnerLayout`. Supplier views
already subscribe to that channel for online status and now also receive its
conversation-filtered AI activity. No presence/online-status behavior is changed.

## Verification

Run from `frontend`:

```powershell
node --test tests/chatTyping.test.mjs
npm exec --yes --package=playwright-core -- node tests/chatTyping.browser.mjs
npm run build
```

The browser runner uses installed Microsoft Edge in headless mode. Set
`CHAT_BROWSER_EXECUTABLE` to another Chromium executable if needed. It uses a
separate Vite test cache and fresh browser contexts; configured Supabase frontend
environment variables are required for its real broadcast transport.

Completed checks:

- Targeted ESLint passed for all changed runtime files and browser fixtures.
  The production build passed with the project's locked dependency versions;
  its existing Node-version and large-chunk warnings remain.
- Fourteen lifecycle cases passed: bidirectional signals; same-user tab suppression;
  conversation isolation; throttling including rapid restarts; exact idle stop;
  clear/send/message cleanup; lost-update expiry; lifecycle/connection cleanup;
  multiple participants; AI success/error/timeout/reply cleanup; negotiation AI
  delivery through the existing presence channel.
- New regressions also cover input and receive events before subscription
  readiness, signals without tab IDs, per-sender aggregation, and human typing
  persisting across an AI reply that uses the same sender ID.
- Actual owner and supplier views exchanged signals across isolated browser
  sessions using real Supabase Realtime. Labels named Juan/Maria, incoming human
  typing was left in both views, and the viewer's own typing was never rendered.
- AI FAQ success, error, and timeout were exercised through the original FAQ
  helper with fixture responses. The supplier indicator was left; the owner's
  indicator was right. Generated replies rendered through the existing message
  handlers. Widget sending and AI thinking were also exercised.
- Browser fixtures now match the application's Strict Mode. Both independent
  indicators were verified together in the supplier page and widget, including
  across the AI reply. Switching the owner view between conversations did not
  carry over typing state. The first supplier input occurs before a deliberately
  delayed subscription-ready callback and is delivered once ready.
- Left/right tail geometry and inherited tail/bubble background colors were
  checked. Indicator slot height stayed constant when activity changed.
- All three views were checked at mobile width and in dark mode. Reduced-motion
  mode disabled dot animation. Long fixture threads auto-scrolled the activity
  into view; compact-widget bounds checks kept the header and indicator visible
  above the composer.
- Closing a tab and dropping its network connection dismissed remote activity.
- Screenshots were visually inspected under `tests/artifacts/` (ignored).

The browser sessions used test identities and fixture messages/AI responses,
with real broadcast transport. They did not authenticate as real application
accounts, read/write application rows, call real AI APIs, approve contracts,
send notifications, or exercise real document/image storage. Signed-in
buyer/supplier and real contract/image workflows therefore still need a
deployment/account smoke test. The owner and supplier account emails were
provided, but no authenticated session or login method was available to the agent.
