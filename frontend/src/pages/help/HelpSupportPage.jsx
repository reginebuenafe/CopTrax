import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LuArrowLeft, LuSearch, LuChevronDown, LuUserRound, LuHandshake,
  LuTruck, LuWallet, LuFileText, LuShieldCheck, LuMail, LuPhone, LuClock, LuSendHorizontal,
} from "react-icons/lu";

const SUPPORT_EMAIL = "support@nerccopratrading.com"; // dummy address for now
const SUPPORT_PHONE = "+63 912 345 6789";
const SUPPORT_HOURS = "Monday-Friday; 9:00 AM - 6:00 PM";

/**
 * category/item data — every answer here is grounded in CopTrax's actual implemented
 * behavior (negotiation flow, contract statuses, delivery/weighing rules, payment statuses,
 * rating formula, etc.). Nothing here should describe a feature that doesn't exist.
 */
const CATEGORIES = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: LuUserRound,
    items: [
      {
        q: "How do I log in to CopTrax?",
        keywords: "login sign in email password",
        a: (
          <p>
            Go to the Login page and sign in with the email and password you registered with.
            Your dashboard depends on your account's role: Business Owner, Supplier, Weigher, or
            Laboratory Staff.
          </p>
        ),
      },
      {
        q: "How do I reset my password?",
        keywords: "forgot password reset recovery email link",
        a: (
          <p>
            On the Login page, click <span className="font-semibold text-brown-dark">"Forgot password?"</span> and
            enter your email address. CopTrax will send a password reset link to that email.
            Open it and set a new password (at least 8 characters).
          </p>
        ),
      },
      {
        q: "How do I update my account information?",
        keywords: "account settings update phone address bank contact",
        a: (
          <p>
            Open <span className="font-semibold text-brown-dark">Account Settings</span> from your
            dashboard (accessible from your profile menu). You can update your contact details and
            bank account information yourself at any time. No approval is required for these changes.
          </p>
        ),
      },
      {
        q: "What should I do if I cannot access my account?",
        keywords: "cannot login locked pending verification rejected",
        a: (
          <>
            <p>
              If you're a new Supplier and your account shows{" "}
              <span className="font-semibold text-brown-dark">"Pending Verification"</span>, this is
              expected. The Business Owner needs to review your registration (ID, signature, and
              bank details) before your dashboard becomes accessible. You'll receive an email once
              your account is approved or rejected.
            </p>
            <p>
              If you've forgotten your password, use the "Forgot password?" link above. If neither
              applies and you still can't get in, reach out through the Contact Support section below.
            </p>
          </>
        ),
      },
      {
        q: "What are the different user roles in CopTrax?",
        keywords: "roles business owner supplier weigher laboratory staff",
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-semibold text-brown-dark">Business Owner</span>: manages suppliers, negotiations, contracts, deliveries, payments, and staff accounts.</li>
            <li><span className="font-semibold text-brown-dark">Supplier</span>: negotiates prices, signs contracts, and tracks their own deliveries, payments, and rating.</li>
            <li><span className="font-semibold text-brown-dark">Weigher</span>: records delivery weighing (Walk-in or Contractual).</li>
            <li><span className="font-semibold text-brown-dark">Laboratory Staff</span>: records moisture content and quality assessment results.</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: "for-suppliers",
    title: "For Suppliers",
    icon: LuHandshake,
    items: [
      {
        q: "How do I start a negotiation?",
        keywords: "propose price start negotiation supplier initiate",
        a: (
          <p>
            Open a chat with the Business Owner and use the{" "}
            <span className="font-semibold text-brown-dark">"Propose Price"</span> button to submit
            your proposed price per kilogram and volume. Only Suppliers can start a negotiation this
            way.
          </p>
        ),
      },
      {
        q: "How do price and volume proposals work?",
        keywords: "price per kg volume tons proposal",
        a: (
          <p>
            A proposal includes a price per kilogram and a volume. Once submitted, the Business Owner
            can review it and respond. The proposal appears as a card in the chat, not as an
            ordinary message.
          </p>
        ),
      },
      {
        q: "How do I accept, counteroffer, or decline an offer?",
        keywords: "accept counter decline reject offer respond",
        a: (
          <>
            <p>
              Whoever receives the latest offer sees three actions on the proposal card:{" "}
              <span className="font-semibold text-brown-dark">Accept</span>,{" "}
              <span className="font-semibold text-brown-dark">Counter</span>, or{" "}
              <span className="font-semibold text-brown-dark">Decline</span>.
            </p>
            <p>
              After you send an offer or counteroffer, only the <em>other party</em> can respond.
              You'll see "Awaiting NERC's response…" until the Business Owner acts. Counteroffers can
              go back and forth until one side accepts or declines.
            </p>
            <p>
              Declining an offer ends that negotiation entirely. It cannot be revived, and a new
              negotiation must be started if you want to try again.
            </p>
          </>
        ),
      },
      {
        q: "How do I review and sign a contract?",
        keywords: "review sign contract electronic signature",
        a: (
          <p>
            Once an offer is accepted, a contract is generated from those exact terms. You'll see a{" "}
            <span className="font-semibold text-brown-dark">"Review & Sign Contract"</span> button in
            the chat or on your Contracts page. Read it carefully, then sign electronically. The
            contract becomes <span className="font-semibold text-brown-dark">Active</span> once both
            you and the Business Owner have signed.
          </p>
        ),
      },
      {
        q: "How do I view active, completed, and breached contracts?",
        keywords: "contract status pending active completed breached",
        a: (
          <p>
            Go to <span className="font-semibold text-brown-dark">My Contracts</span> in your
            dashboard. You can filter by status: All, Pending, Active, Completed, or Breached. See
            the Contracts section below for what each status means.
          </p>
        ),
      },
      {
        q: "How do I monitor my deliveries?",
        keywords: "delivery status track monitor",
        a: (
          <p>
            The <span className="font-semibold text-brown-dark">Deliveries</span> page lists every
            delivery recorded against your contracts, including weight, quality results, and whether
            it was accepted or rejected.
          </p>
        ),
      },
      {
        q: "How do I view quality assessment results?",
        keywords: "moisture content quality inspection results",
        a: (
          <p>
            Open a delivery on your Deliveries page to see its moisture content reading and the
            resulting quality outcome: accepted, rejected, or the discount that was applied.
          </p>
        ),
      },
      {
        q: "How do I check my payment status?",
        keywords: "payment status pending processing released failed",
        a: (
          <p>
            Your <span className="font-semibold text-brown-dark">Payments</span> page lists every
            delivery's payout with its current status. See the Payments section below for what each
            status means.
          </p>
        ),
      },
      {
        q: "How do I view my receipts?",
        keywords: "receipt e-receipt download view",
        a: (
          <p>
            Expand a payment on your Payments page. If an e-receipt has been generated for it,
            you'll see its receipt number and the date it was issued directly in that view.
          </p>
        ),
      },
      {
        q: "How do supplier ratings work?",
        keywords: "rating stars fulfillment volume quality score",
        a: (
          <p>
            Your rating is calculated only when a contract reaches{" "}
            <span className="font-semibold text-brown-dark">Completed</span> or{" "}
            <span className="font-semibold text-brown-dark">Breached</span> status, weighted 60% on
            contract fulfillment, 20% on delivered volume, and 20% on copra quality. Your overall
            rating is the average across all your contracts and is visible on{" "}
            <span className="font-semibold text-brown-dark">My Rating</span>.
          </p>
        ),
      },
    ],
  },
  {
    id: "deliveries-quality",
    title: "Deliveries & Quality",
    icon: LuTruck,
    items: [
      {
        q: "How does delivery weighing work?",
        keywords: "weigher weighing gross net weight truck",
        a: (
          <p>
            When your copra arrives, a Weigher records the delivery as either{" "}
            <span className="font-semibold text-brown-dark">Contractual</span> (against one of your
            active contracts) or <span className="font-semibold text-brown-dark">Walk-in</span> (no
            contract involved).
          </p>
        ),
      },
      {
        q: "What do Gross Weight, deductions, and Net/Final Weight mean?",
        keywords: "gross weight tare deduction net final weight sacks",
        a: (
          <p>
            <span className="font-semibold text-brown-dark">Gross weight</span> is the total weight
            as delivered. Applicable deductions (such as sack/tare weight, and a wet-condition
            deduction for walk-in deliveries) are subtracted to arrive at the{" "}
            <span className="font-semibold text-brown-dark">net or final weight</span>, and this is the
            weight your payment is based on.
          </p>
        ),
      },
      {
        q: "What is Moisture Content (MC) and why does it matter?",
        keywords: "moisture content mc percentage discount reject 20.2 5.0",
        a: (
          <p>
            Moisture content is measured by Laboratory Staff and directly affects your price. MC of
            5.0% or below gets no discount. Between 5.0% and 20.2%, a discount percentage is applied
            based on NERC's official moisture discount table. Above 20.2%, the delivery is
            automatically rejected with no payment.
          </p>
        ),
      },
      {
        q: "How does quality assessment and the resulting discount work?",
        keywords: "quality assessment discount table lookup",
        a: (
          <p>
            Quality assessment is based on the moisture content reading, looked up against NERC's
            fixed discount table. It's not a formula that changes delivery to delivery, so the same
            reading always results in the same discount.
          </p>
        ),
      },
      {
        q: "What happens when a delivery is accepted or rejected?",
        keywords: "accepted rejected delivery outcome",
        a: (
          <p>
            An accepted delivery moves forward for payment at the applicable price. A rejected
            delivery (for example, due to moisture content above 20.2%) does not proceed to payment.
          </p>
        ),
      },
      {
        q: "How do walk-in deliveries work?",
        keywords: "walk-in walkin no contract spot price",
        a: (
          <p>
            Walk-in deliveries aren't tied to any contract and are always paid at the current spot
            price rather than a negotiated contract price. If you have an Active contract, ask the
            Weigher to record your delivery as Contractual instead so it counts toward that contract.
          </p>
        ),
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    icon: LuWallet,
    items: [
      {
        q: "How does CopTrax calculate payments?",
        keywords: "payment calculation price weight discount",
        a: (
          <p>
            Payment is based on your delivery's accepted weight, the applicable price (contract or
            spot, see below), and any moisture-content discount that applies. Each delivery is paid
            out as its own separate transaction.
          </p>
        ),
      },
      {
        q: "What do Pending, Processing, Released, and Failed mean?",
        keywords: "pending processing released failed payment status meaning",
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-semibold text-brown-dark">Pending</span>: the payment has been recorded but not yet sent for disbursement.</li>
            <li><span className="font-semibold text-brown-dark">Processing</span>: the payout has been submitted and is being confirmed by the payment provider.</li>
            <li><span className="font-semibold text-brown-dark">Released</span>: the payment has been successfully sent to your bank account.</li>
            <li><span className="font-semibold text-brown-dark">Failed</span>: the payout attempt did not go through.</li>
          </ul>
        ),
      },
      {
        q: "What's the difference between contract-price and spot-price payments?",
        keywords: "contract price spot price difference",
        a: (
          <p>
            Deliveries against an Active contract are paid at that contract's negotiated price.
            Deliveries with no contract involved, including Walk-in deliveries, are paid at the
            current spot price, which the Business Owner sets and updates directly.
          </p>
        ),
      },
      {
        q: "Where can I find my payment history?",
        keywords: "payment history list",
        a: (
          <p>
            Your <span className="font-semibold text-brown-dark">Payments</span> page lists every
            payment tied to your deliveries, along with its status and amount.
          </p>
        ),
      },
      {
        q: "How do I access my electronic receipts?",
        keywords: "electronic receipt access",
        a: (
          <p>
            Expand any payment on your Payments page. If a receipt has been generated, its receipt
            number and issue date are shown there.
          </p>
        ),
      },
      {
        q: "What if a payment amount looks incorrect?",
        keywords: "wrong incorrect amount discrepancy",
        a: (
          <p>
            Check the delivery's recorded weight and moisture-content discount first, since those
            drive the calculation. If it still looks wrong, contact NERC Copra Trading using the
            details at the bottom of this page.
          </p>
        ),
      },
      {
        q: "What if my payment stays Pending or shows Failed?",
        keywords: "stuck pending failed payment not released",
        a: (
          <p>
            This can happen while a payout is being processed or if the disbursement attempt didn't
            go through. CopTrax doesn't currently guarantee a fixed processing time. If a payment
            stays Pending or Failed for longer than expected, reach out through Contact Support below.
          </p>
        ),
      },
    ],
  },
  {
    id: "contracts",
    title: "Contracts",
    icon: LuFileText,
    items: [
      {
        q: "What do the contract statuses mean?",
        keywords: "pending active completed breached status meaning",
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-semibold text-brown-dark">Pending</span>: the contract has been generated but is waiting for both parties to sign.</li>
            <li><span className="font-semibold text-brown-dark">Active</span>: both the Supplier and the Business Owner have signed; deliveries can now be recorded against it.</li>
            <li><span className="font-semibold text-brown-dark">Completed</span>: the full contracted quantity has been delivered.</li>
            <li><span className="font-semibold text-brown-dark">Breached</span>: the delivery deadline passed before the contracted quantity was fully delivered.</li>
          </ul>
        ),
      },
      {
        q: "How does contract signing work?",
        keywords: "sign contract electronic signature both parties",
        a: (
          <p>
            After a proposal is accepted, both the Supplier and the Business Owner must electronically
            sign the generated contract before it becomes Active. Only Active contracts accept normal
            deliveries.
          </p>
        ),
      },
      {
        q: "What is the target quantity and delivery progress?",
        keywords: "target quantity delivery progress fulfillment",
        a: (
          <p>
            Each contract has an agreed quantity from the accepted negotiation. Your Contracts page
            shows how much has been delivered so far against that target, and how much remains.
          </p>
        ),
      },
      {
        q: "How is the contract deadline determined?",
        keywords: "deadline due date activation",
        a: (
          <p>
            The delivery deadline is automatically set to one month and one day after the contract's
            activation date. It is not something either party negotiates or edits manually.
          </p>
        ),
      },
      {
        q: "What happens when the contracted quantity is fully delivered?",
        keywords: "fulfilled completed quantity reached",
        a: (
          <p>
            Once the full agreed quantity has been delivered and accepted, the contract automatically
            moves to Completed status.
          </p>
        ),
      },
      {
        q: "What does a breached contract mean?",
        keywords: "breach deadline passed incomplete",
        a: (
          <p>
            A contract is automatically marked Breached if its delivery deadline passes before the
            full agreed quantity has been delivered. Breached contracts affect the supplier rating
            for that contract.
          </p>
        ),
      },
    ],
  },
  {
    id: "account-security",
    title: "Account & Security",
    icon: LuShieldCheck,
    items: [
      {
        q: "How do I reset a forgotten password?",
        keywords: "forgot reset password recovery",
        a: (
          <p>
            Use the "Forgot password?" link on the Login page to receive a reset email, then set a
            new password of at least 8 characters.
          </p>
        ),
      },
      {
        q: "How do I keep my account secure?",
        keywords: "security tips protect account",
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li>Use a strong, unique password.</li>
            <li>Never share your password with anyone.</li>
            <li>Log out when using a shared or public device.</li>
          </ul>
        ),
      },
      {
        q: "What should I do if I suspect unauthorized access to my account?",
        keywords: "unauthorized access hacked compromised",
        a: (
          <p>
            Change your password immediately if you're still able to log in, and notify NERC Copra
            Trading right away using the Contact Support details below.
          </p>
        ),
      },
      {
        q: "Why shouldn't I share my password?",
        keywords: "share password never chat",
        a: (
          <p>
            Sharing your password lets someone else act as you in the system, including negotiations,
            contract signing, and payment details. NERC Copra Trading will never ask for your password
            through a negotiation chat or an ordinary support message.
          </p>
        ),
      },
      {
        q: "How do I log out securely?",
        keywords: "sign out log out",
        a: (
          <p>
            Use the <span className="font-semibold text-brown-dark">Sign Out</span> option in your
            profile menu. CopTrax also automatically signs you out after a period of inactivity for
            your protection.
          </p>
        ),
      },
      {
        q: "How do I report a suspected security problem?",
        keywords: "report vulnerability security issue",
        a: (
          <p>
            Please report it responsibly to NERC Copra Trading using the Contact Support details
            below rather than attempting to exploit it.
          </p>
        ),
      },
    ],
  },
];

function FaqItem({ id, q, a, open, onToggle }) {
  return (
    <div className="border-b border-beige-dark/30 first:border-t">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left text-sm sm:text-[15px] font-semibold text-brown-dark hover:text-green-dark transition-colors"
      >
        <span>{q}</span>
        <LuChevronDown className={`w-4 h-4 shrink-0 text-brown-light transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pb-4 -mt-1 text-[14px] sm:text-[15px] text-brown-mid leading-relaxed space-y-2 pr-7">
          {a}
        </div>
      )}
    </div>
  );
}

export default function HelpSupportPage() {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());

  function toggleItem(id) {
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => `${item.q} ${item.keywords}`.toLowerCase().includes(q)),
      }))
      .filter(cat => cat.items.length > 0);
  }, [query]);

  const noResults = query.trim().length > 0 && filteredCategories.length === 0;
  const hasSupportContact = SUPPORT_EMAIL || SUPPORT_PHONE || SUPPORT_HOURS;

  return (
    <div className="bg-beige min-h-screen pt-28 sm:pt-32 pb-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brown-mid hover:text-green-dark transition-colors mb-8"
        >
          <LuArrowLeft className="w-4 h-4" /> Back to Homepage
        </Link>

        <header className="mb-8 pb-8 border-b border-beige-dark/40">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-brown-dark leading-tight">Help & Support</h1>
          </div>
          <p className="text-sm sm:text-[15px] text-brown-mid italic leading-relaxed mt-3">
            Find answers, learn how to use CopTrax, or get assistance with your account and transactions.
          </p>

          <div className="relative mt-5">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="How can we help?"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-beige-dark bg-white/70
                text-brown-dark placeholder-brown-light/60 text-sm
                focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all duration-200"
            />
          </div>
        </header>

        <article>
          {noResults ? (
            <p className="text-sm text-brown-mid text-center py-10">
              No help articles matched &ldquo;{query}&rdquo;. Try a different search term, or contact
              support below.
            </p>
          ) : (
            filteredCategories.map(cat => (
              <section key={cat.id} className="mb-9 last:mb-0 pb-9 border-b border-beige-dark/30 last:border-b-0 last:pb-0">
                <h2 className="text-base sm:text-lg font-bold text-brown-dark mb-1 flex items-center gap-2">
                  <cat.icon className="w-4.5 h-4.5 text-green-mid shrink-0" />
                  <span>{cat.title}</span>
                </h2>
                <div>
                  {cat.items.map((item, i) => {
                    const id = `${cat.id}-${i}`;
                    return (
                      <FaqItem key={id} id={id} q={item.q} a={item.a} open={openIds.has(id)} onToggle={toggleItem} />
                    );
                  })}
                </div>
              </section>
            ))
          )}

          <section className="pt-1">
            <h2 className="text-base sm:text-lg font-bold text-brown-dark mb-1.5">Still need help?</h2>
            <p className="text-sm sm:text-[15px] text-brown-mid leading-relaxed mb-4">
              If you couldn't find an answer above, contact NERC Copra Trading for assistance.
            </p>

            <div className="space-y-2">
              <p className="font-bold text-brown-dark">NERC Copra Trading</p>
              <ul className="space-y-1.5 text-[14px] sm:text-[15px] text-brown-mid">
                <li className="flex items-center gap-2">
                  <LuMail className="w-4 h-4 text-green-mid shrink-0" />
                  <span>Email: {SUPPORT_EMAIL
                    ? <span className="text-brown-dark">{SUPPORT_EMAIL}</span>
                    : <span className="italic text-brown-light">[OFFICIAL SUPPORT EMAIL]</span>}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <LuPhone className="w-4 h-4 text-green-mid shrink-0" />
                  <span>Contact Number: {SUPPORT_PHONE
                    ? <span className="text-brown-dark">{SUPPORT_PHONE}</span>
                    : <span className="italic text-brown-light">{SUPPORT_PHONE}</span>}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <LuClock className="w-4 h-4 text-green-mid shrink-0" />
                  <span>Business Hours: {SUPPORT_HOURS
                    ? <span className="text-brown-dark">{SUPPORT_HOURS}</span>
                    : <span className="italic text-brown-light">{SUPPORT_HOURS}</span>}
                  </span>
                </li>
              </ul>

              {SUPPORT_EMAIL ? (
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm hover:shadow-glow-green transition-all"
                >
                  <LuSendHorizontal className="w-4 h-4" /> Contact Support
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Support email not yet configured"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-beige-dark/40 text-brown-light font-semibold text-sm cursor-not-allowed"
                >
                  <LuSendHorizontal className="w-4 h-4" /> Contact Support
                </button>
              )}
              {!hasSupportContact && (
                <p className="text-xs text-brown-light/80 pt-1">
                  Support contact details have not yet been configured for this deployment.
                </p>
              )}
            </div>

            <p className="text-sm text-brown-mid mt-8 pt-6 border-t border-beige-dark/30">
              <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
                Privacy Policy
              </Link>
              {" · "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
                Terms & Conditions
              </Link>
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
