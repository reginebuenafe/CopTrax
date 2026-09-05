import { LuMail, LuPhone, LuMapPin } from "react-icons/lu";
import LegalPageLayout, { LegalSection, LegalSubheading } from "./LegalPageLayout";

const introContent = (
  <>
    <p>
      NERC Copra Trading (&ldquo;NERC,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) respects the privacy
      of individuals who use <span className="font-semibold text-brown-dark">CopTrax</span>, our
      web-based copra management system.
    </p>
    <p>
      This Privacy Notice explains how personal information is collected, used, stored, disclosed,
      and protected when Business Owners, Suppliers, Weighers, Laboratory Staff, and other
      authorized users access or use CopTrax.
    </p>
    <p>
      We process personal information in accordance with{" "}
      <span className="font-semibold text-brown-dark">
        Republic Act No. 10173, otherwise known as the Data Privacy Act of 2012
      </span>, its Implementing Rules and Regulations, and applicable issuances of the National
      Privacy Commission (&ldquo;NPC&rdquo;).
    </p>
  </>
);

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      lastUpdated="September 5, 2026"
      intro={introContent}
    >
      <LegalSection n={1} title="Information We Collect">
        <p>Depending on your role and use of CopTrax, we may collect and process information such as:</p>

        <LegalSubheading title="Account and identity information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Full name</li>
            <li>Email address</li>
            <li>Contact information</li>
            <li>Account role</li>
            <li>Authentication and account information</li>
          </ul>
        </LegalSubheading>

        <LegalSubheading title="Supplier and business information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Supplier information</li>
            <li>Business or operational information</li>
            <li>Contract information</li>
            <li>Agreed prices and quantities</li>
            <li>Supplier performance and rating information</li>
          </ul>
        </LegalSubheading>

        <LegalSubheading title="Delivery and quality information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Delivery records</li>
            <li>Gross, net, and final weights</li>
            <li>Number of sacks</li>
            <li>Moisture content and quality assessment results</li>
            <li>Deductions and accepted quantities</li>
            <li>Delivery dates and statuses</li>
          </ul>
        </LegalSubheading>

        <LegalSubheading title="Payment and transaction information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Payment amounts</li>
            <li>Payment status</li>
            <li>Payment references</li>
            <li>Transaction and payout records</li>
            <li>Electronic receipts</li>
          </ul>
        </LegalSubheading>

        <LegalSubheading title="System information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Login and authentication activity</li>
            <li>Timestamps</li>
            <li>Records of actions performed within the system</li>
            <li>Other technical information reasonably necessary for system security, troubleshooting, and operation</li>
          </ul>
        </LegalSubheading>

        <p>
          CopTrax should only collect information that is reasonably necessary for its legitimate
          business and system purposes, consistent with the principles of transparency, legitimate
          purpose, and proportionality under Philippine data-protection rules.
        </p>
      </LegalSection>

      <LegalSection n={2} title="How We Use Your Information">
        <p>Personal information collected through CopTrax may be used to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Create, authenticate, and manage user accounts;</li>
          <li>Identify users and enforce role-based access;</li>
          <li>Create and manage supplier contracts;</li>
          <li>Facilitate contract negotiations and agreements;</li>
          <li>Record and monitor copra deliveries;</li>
          <li>Record weighing and laboratory results;</li>
          <li>Calculate delivery quantities, deductions, and payment amounts;</li>
          <li>Process and monitor supplier payments;</li>
          <li>Generate contracts, receipts, reports, and other business records;</li>
          <li>Provide notifications regarding contracts, deliveries, payments, and other transactions;</li>
          <li>Maintain transaction histories and audit records;</li>
          <li>Detect, investigate, and prevent unauthorized access, fraud, abuse, or security incidents;</li>
          <li>Maintain, troubleshoot, and improve CopTrax; and</li>
          <li>Comply with applicable legal, regulatory, accounting, and business requirements.</li>
        </ul>
        <p>
          We will not process personal information for purposes that are incompatible with the
          purposes disclosed in this Privacy Notice unless permitted or required by law.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Legal Basis for Processing">
        <p>Where applicable, personal information may be processed based on:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Your consent;</li>
          <li>The performance of a contract or actions necessary in connection with a contractual relationship;</li>
          <li>Compliance with legal obligations;</li>
          <li>Legitimate business interests of NERC Copra Trading, provided such processing does not improperly override your privacy rights; or</li>
          <li>Other lawful grounds permitted under the Data Privacy Act and applicable regulations.</li>
        </ul>
        <p>
          The DPA permits processing on several lawful grounds rather than requiring consent for
          every processing activity.
        </p>
      </LegalSection>

      <LegalSection n={4} title="How We Share Information">
        <p>
          Access to information stored in CopTrax is limited according to the user's authorized role
          and operational responsibilities.
        </p>
        <p>For example, information may be accessible to authorized:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Business Owners;</li>
          <li>Suppliers;</li>
          <li>Weighers;</li>
          <li>Laboratory Staff; and</li>
          <li>System administrators or authorized personnel where necessary for system operation and maintenance.</li>
        </ul>
        <p>
          Information may also be processed by third-party service providers used to operate
          CopTrax, such as hosting, database, authentication, email, artificial-intelligence, or
          payment service providers, where applicable.
        </p>
        <p>These providers should receive only information reasonably necessary to perform their respective services.</p>
        <p>
          We may also disclose information when required by law, regulation, court order, or a
          lawful request from a competent government authority.
        </p>
        <p className="font-semibold text-brown-dark">
          NERC Copra Trading does not sell users' personal information.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Artificial Intelligence Features">
        <p>
          CopTrax may use artificial intelligence services to assist with limited system functions,
          such as providing assistance during negotiations or answering system-related questions.
        </p>
        <p>
          AI functionality does not replace the authority of the Business Owner or other authorized
          personnel to make business decisions.
        </p>
        <p>
          Where information must be transmitted to an AI service provider for a particular feature to
          operate, only information reasonably necessary for that functionality should be processed.
        </p>
        <p>
          Users should not intentionally submit passwords, authentication credentials, or unnecessary
          sensitive personal information through AI-assisted chat features.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Data Storage and Security">
        <p>
          CopTrax uses reasonable organizational, physical, and technical safeguards designed to
          protect information against unauthorized access, alteration, disclosure, loss, or
          destruction.
        </p>
        <p>
          Such measures may include authentication controls, role-based access restrictions,
          database security policies, secure communications, access controls, and system monitoring.
        </p>
        <p>
          However, no information system or method of electronic transmission can guarantee absolute
          security. Users are also responsible for maintaining the confidentiality of their account
          credentials.
        </p>
        <p>
          Philippine privacy regulations require appropriate organizational, physical, and technical
          security measures based on the nature and risks of the processing.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Data Retention">
        <p>Personal information and business records will be retained only for as long as reasonably necessary to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Operate CopTrax;</li>
          <li>Fulfill the purposes described in this Privacy Notice;</li>
          <li>Maintain legitimate business and transaction records;</li>
          <li>Resolve disputes;</li>
          <li>Establish or defend legal claims; and</li>
          <li>Meet applicable legal, accounting, or regulatory requirements.</li>
        </ul>
        <p>
          When information is no longer required, it will be securely deleted, anonymized, or
          otherwise disposed of in accordance with applicable requirements.
        </p>
        <p>
          This avoids promising an arbitrary period such as &ldquo;we delete everything after 30
          days&rdquo;; the DPA itself follows the principle that personal information should
          generally be retained only as long as necessary for its legitimate purpose or other lawful
          grounds.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Your Privacy Rights">
        <p>Subject to the conditions provided by applicable law, you may have the right to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><span className="font-semibold text-brown-dark">Be informed</span> about the processing of your personal information;</li>
          <li><span className="font-semibold text-brown-dark">Access</span> personal information concerning you;</li>
          <li><span className="font-semibold text-brown-dark">Correct</span> inaccurate or incomplete information;</li>
          <li><span className="font-semibold text-brown-dark">Object</span> to certain processing of your information;</li>
          <li><span className="font-semibold text-brown-dark">Request erasure or blocking</span> where legally appropriate;</li>
          <li><span className="font-semibold text-brown-dark">Withdraw consent</span> where processing relies on consent;</li>
          <li><span className="font-semibold text-brown-dark">Data portability</span> where applicable;</li>
          <li><span className="font-semibold text-brown-dark">Seek damages</span> when legally warranted; and</li>
          <li><span className="font-semibold text-brown-dark">File a complaint with the National Privacy Commission</span> if you believe your privacy rights have been violated.</li>
        </ul>
        <p>These rights are recognized under the Philippine data-privacy framework.</p>
        <p>Requests may be subject to identity verification and other requirements permitted by law.</p>
      </LegalSection>

      <LegalSection n={9} title="Account and Password Security">
        <p>Users are responsible for keeping their CopTrax login credentials confidential.</p>
        <p>You should:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Use a strong and unique password;</li>
          <li>Never share your password with another person;</li>
          <li>Log out when using shared or public devices; and</li>
          <li>Immediately report suspected unauthorized access to your account.</li>
        </ul>
        <p>
          NERC Copra Trading will never require users to provide their passwords through negotiation
          chats or ordinary support messages.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Third-Party Services">
        <p>
          CopTrax may rely on third-party technology providers for functions such as cloud
          infrastructure, authentication, email delivery, payment processing, or AI-assisted
          functionality.
        </p>
        <p>
          Information processed through those services may also be subject to the providers'
          applicable privacy and security practices.
        </p>
        <p>
          NERC Copra Trading will endeavor to use service providers appropriate for the nature of the
          information being processed and the services being provided.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Changes to This Privacy Notice">
        <p>
          We may revise this Privacy Notice when CopTrax's functionality, information-processing
          practices, or applicable legal requirements change.
        </p>
        <p>
          When material changes are made, the updated notice will be made available through CopTrax
          and the <span className="font-semibold text-brown-dark">Last Updated</span> date will be
          revised.
        </p>
        <p>
          The NPC similarly recommends updating privacy notices when processing practices change and
          communicating substantial changes appropriately.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contact Us">
        <p>
          For questions, concerns, requests, or complaints regarding your personal information or
          this Privacy Notice, please contact:
        </p>
        <div className="pt-1">
          <p className="font-bold text-brown-dark">NERC Copra Trading</p>
          <p className="text-brown-mid text-[13.5px] mb-2">Data Privacy Contact / Authorized Representative</p>
          <ul className="space-y-1.5 text-[14px] sm:text-[15px]">
            <li className="flex items-center gap-2">
              <LuMail className="w-4 h-4 text-green-mid shrink-0" />
              <span>Email: <span className="italic text-brown-light">nerc.copra@gmail.com</span></span>
            </li>
            <li className="flex items-center gap-2">
              <LuPhone className="w-4 h-4 text-green-mid shrink-0" />
              <span>Contact Number: <span className="italic text-brown-light">+63 912 345 6789</span></span>
            </li>
            <li className="flex items-start gap-2">
              <LuMapPin className="w-4 h-4 text-green-mid shrink-0 mt-0.5" />
              <span>Business Address: <span className="italic text-brown-light">Kumalarang, Zamboanga del Sur</span></span>
            </li>
          </ul>
        </div>
        <p>
          You may also contact or file a complaint with the{" "}
          <span className="font-semibold text-brown-dark">National Privacy Commission of the Philippines</span>{" "}
          if you believe your rights under applicable data-protection law have been violated.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
