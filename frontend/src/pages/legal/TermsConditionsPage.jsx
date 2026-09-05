import { LuMail, LuPhone, LuMapPin } from "react-icons/lu";
import { Link } from "react-router-dom";
import LegalPageLayout, { LegalSection } from "./LegalPageLayout";

const introContent = (
  <>
    <p>
      These Terms and Conditions (&ldquo;Terms&rdquo;) govern access to and use of{" "}
      <span className="font-semibold text-brown-dark">CopTrax</span>, a web-based copra management
      system operated for <span className="font-semibold text-brown-dark">NERC Copra Trading</span>{" "}
      (&ldquo;NERC,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;).
    </p>
    <p>
      By creating an account, accessing, or using CopTrax, you acknowledge that you have read,
      understood, and agree to comply with these Terms and the CopTrax{" "}
      <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
        Privacy Policy
      </Link>.
    </p>
    <p>If you do not agree with these Terms, you should not access or use CopTrax.</p>
  </>
);

export default function TermsConditionsPage() {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      lastUpdated="September 5, 2026"
      intro={introContent}
    >
      <LegalSection n={1} title="Purpose of CopTrax">
        <p>
          CopTrax is designed to support and manage business transactions and operations between
          NERC Copra Trading and its authorized users.
        </p>
        <p>The system provides functionality including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>User and account management;</li>
          <li>Supplier management;</li>
          <li>Copra price and quantity negotiations;</li>
          <li>Contract creation and management;</li>
          <li>Electronic contract review and signing;</li>
          <li>Delivery recording and monitoring;</li>
          <li>Weighing and quality assessment;</li>
          <li>Payment and transaction management;</li>
          <li>Electronic receipts;</li>
          <li>Supplier performance records;</li>
          <li>Reports and dashboards;</li>
          <li>Notifications; and</li>
          <li>Other functions necessary to support NERC Copra Trading's operations.</li>
        </ul>
        <p>Features available to each user depend on the role and permissions assigned to their account.</p>
      </LegalSection>

      <LegalSection n={2} title="Eligibility and Authorized Use">
        <p>CopTrax is intended only for persons authorized by NERC Copra Trading to use the system.</p>
        <p>Users may be assigned roles such as:</p>
        <ul className="space-y-2">
          <li><span className="font-semibold text-brown-dark">Business Owner</span>: manages authorized business operations, contracts, suppliers, deliveries, payments, staff accounts, and other administrative functions.</li>
          <li><span className="font-semibold text-brown-dark">Supplier</span>: participates in negotiations, manages contracts, monitors deliveries and payments, and accesses information associated with their account.</li>
          <li><span className="font-semibold text-brown-dark">Weigher</span>: records authorized weighing and delivery information.</li>
          <li><span className="font-semibold text-brown-dark">Laboratory Staff</span>: records moisture content, quality assessments, and other authorized laboratory information.</li>
        </ul>
        <p>
          Users must not attempt to access functions, records, accounts, or information outside the
          permissions granted to their assigned role.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Account Registration and Information">
        <p>
          Users must provide accurate, complete, and current information when creating or maintaining
          a CopTrax account.
        </p>
        <p>You are responsible for ensuring that information submitted through your account is accurate.</p>
        <p>You must not:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Create an account using another person's identity without authorization;</li>
          <li>Provide intentionally false or misleading information;</li>
          <li>Impersonate another user;</li>
          <li>Create unauthorized accounts; or</li>
          <li>Attempt to obtain privileges or roles that have not been assigned to you.</li>
        </ul>
        <p>
          NERC may correct, restrict, suspend, or investigate accounts containing inaccurate,
          fraudulent, or unauthorized information where reasonably necessary.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Account Security">
        <p>You are responsible for maintaining the confidentiality and security of your account credentials.</p>
        <p>Passwords must not be shared with other individuals.</p>
        <p>
          You are responsible for activities performed through your account where such activities
          result from your intentional actions or failure to reasonably protect your credentials.
        </p>
        <p>
          If you believe your account has been accessed without authorization, you should immediately
          notify NERC Copra Trading and change your password where possible.
        </p>
        <p>
          NERC may temporarily restrict access to an account when unauthorized access or another
          security issue is reasonably suspected.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Supplier Negotiations and Offers">
        <p>
          CopTrax provides functionality through which Suppliers and the Business Owner may negotiate
          proposed prices and quantities.
        </p>
        <p>
          Offers, counteroffers, acceptances, and declines submitted through the negotiation system
          may be recorded by CopTrax.
        </p>
        <p>Users are responsible for reviewing the price, quantity, and other relevant information before accepting an offer.</p>
        <p>
          Where CopTrax provides automated or AI-assisted negotiation functionality, such functionality
          is intended to assist the negotiation process according to rules established by NERC Copra
          Trading.
        </p>
        <p>The resulting accepted terms should be reviewed through the corresponding contract before signing.</p>
      </LegalSection>

      <LegalSection n={6} title="Contracts and Electronic Acceptance">
        <p>CopTrax may generate electronic contracts based on terms agreed upon through the system.</p>
        <p>Users are responsible for reviewing a contract carefully before signing or accepting it.</p>
        <p>
          By electronically signing or otherwise providing a valid electronic acceptance of a contract
          through CopTrax, the user indicates their intention to accept the terms presented in that
          contract.
        </p>
        <p>Individual contracts may contain terms and obligations separate from these Terms and Conditions.</p>
        <p>
          If there is a conflict concerning a specific copra transaction between these general
          platform Terms and the terms of a valid individual contract, the terms of the individual
          contract will govern that transaction to the extent of the conflict, subject to applicable
          law.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Deliveries and Weight Records">
        <p>CopTrax records information relating to copra deliveries, which may include:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Delivery date;</li>
          <li>Contract;</li>
          <li>Supplier;</li>
          <li>Gross weight;</li>
          <li>Sack deductions;</li>
          <li>Tare or other applicable deductions;</li>
          <li>Net or final weight;</li>
          <li>Moisture content;</li>
          <li>Quality assessment;</li>
          <li>Accepted or rejected quantities; and</li>
          <li>Personnel responsible for recording relevant information.</li>
        </ul>
        <p>Authorized personnel are responsible for entering accurate measurements and information.</p>
        <p>Users must not intentionally manipulate weighing, delivery, laboratory, or quality records.</p>
        <p>
          If an error is discovered, it should be reported and corrected through an authorized process
          rather than concealed or improperly modified.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Quality Assessment">
        <p>
          Copra deliveries may be subject to quality assessment according to NERC Copra Trading's
          applicable operational procedures.
        </p>
        <p>
          Laboratory results, moisture-content readings, quality classifications, deductions, and
          other assessments recorded in CopTrax may affect accepted quantities and payment
          calculations.
        </p>
        <p>Users must not alter or interfere with quality-assessment records without authorization.</p>
      </LegalSection>

      <LegalSection n={9} title="Payments">
        <p>CopTrax may calculate, record, facilitate, or monitor payments relating to accepted copra deliveries.</p>
        <p>Payment amounts may depend on factors including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Contracted or applicable price;</li>
          <li>Accepted quantity or final weight;</li>
          <li>Applicable quality deductions;</li>
          <li>Moisture-content assessment;</li>
          <li>Spot price for transactions where applicable; and</li>
          <li>Other valid transaction adjustments.</li>
        </ul>
        <p>Users should review payment information and report suspected discrepancies through the appropriate NERC process.</p>
        <p>
          A status displayed in CopTrax such as <span className="font-semibold text-brown-dark">Pending</span>,{" "}
          <span className="font-semibold text-brown-dark">Processing</span>,{" "}
          <span className="font-semibold text-brown-dark">Released</span>, or{" "}
          <span className="font-semibold text-brown-dark">Failed</span> represents the transaction
          status recorded by the system and, where applicable, information received from the relevant
          payment service.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Walk-In Transactions">
        <p>CopTrax may support walk-in copra transactions that are not associated with an existing supplier contract.</p>
        <p>
          Applicable weight deductions, quality classifications, spot prices, and payment calculations
          may differ from contracted deliveries according to NERC Copra Trading's established
          procedures.
        </p>
        <p>
          Where a walk-in transaction is designated as a cash transaction, CopTrax may record the
          payment and generate a corresponding transaction record or receipt.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Electronic Receipts and Records">
        <p>CopTrax may generate electronic receipts, contracts, transaction records, and reports.</p>
        <p>Users are responsible for reviewing these records and promptly reporting material discrepancies.</p>
        <p>Records generated by CopTrax are intended to reflect information stored in the system at the relevant time.</p>
        <p>
          Where permitted, NERC may maintain transaction and system records for legitimate business,
          accounting, dispute-resolution, security, and legal purposes.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Artificial Intelligence and Automated Features">
        <p>
          CopTrax may incorporate artificial intelligence or automated functionality to assist with
          certain tasks, including negotiation assistance and system-related questions.
        </p>
        <p>
          AI-generated responses are provided as an <span className="font-semibold text-brown-dark">assistive feature</span> and
          should not be treated as independent legal, financial, or professional advice.
        </p>
        <p>Users remain responsible for reviewing information relevant to their transactions before making decisions or entering agreements.</p>
        <p>
          AI functionality does not independently authorize payments, modify contracts, or override
          user permissions unless such automated functionality has been specifically implemented and
          authorized as part of CopTrax's documented business processes.
        </p>
        <p>
          Users must not intentionally submit passwords, authentication credentials, or unnecessary
          confidential or sensitive information to AI-assisted features.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Acceptable Use">
        <p>Users must use CopTrax only for legitimate and authorized purposes.</p>
        <p>Users must not:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Attempt to gain unauthorized access to CopTrax;</li>
          <li>Access another user's account without authorization;</li>
          <li>Circumvent authentication or access controls;</li>
          <li>Manipulate contracts, deliveries, payments, laboratory results, or transaction records;</li>
          <li>Introduce malicious software or harmful code;</li>
          <li>Exploit vulnerabilities in the system;</li>
          <li>Intentionally interfere with CopTrax's availability or operation;</li>
          <li>Use automated methods to overload or disrupt the service;</li>
          <li>Attempt to obtain information that the user's role is not authorized to access;</li>
          <li>Use CopTrax for fraudulent, unlawful, or deceptive activities; or</li>
          <li>Assist another person in performing any prohibited activity.</li>
        </ul>
        <p>Security vulnerabilities discovered in CopTrax should be reported responsibly rather than exploited.</p>
      </LegalSection>

      <LegalSection n={14} title="Suspension or Restriction of Access">
        <p>NERC Copra Trading may restrict or suspend a user's access when reasonably necessary, including in cases involving:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Suspected unauthorized access;</li>
          <li>Security threats;</li>
          <li>Fraudulent activity;</li>
          <li>Misuse of the system;</li>
          <li>Material violation of these Terms;</li>
          <li>Attempts to manipulate business records; or</li>
          <li>Circumstances where access is no longer authorized.</li>
        </ul>
        <p>Where appropriate, access may be restored after the relevant issue has been resolved.</p>
      </LegalSection>

      <LegalSection n={15} title="Privacy and Personal Information">
        <p>Use of CopTrax involves the collection and processing of personal and business information.</p>
        <p>
          Information processed through CopTrax will be handled according to the{" "}
          <span className="font-semibold text-brown-dark">CopTrax</span>{" "}
          <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
            Privacy Policy
          </Link>{" "}
          and applicable Philippine data-protection requirements.
        </p>
        <p>
          Users should review the Privacy Policy to understand what information is collected, why it
          is processed, how it may be shared, how it is protected, and the rights available to data
          subjects.
        </p>
      </LegalSection>

      <LegalSection n={16} title="System Availability">
        <p>NERC will endeavor to maintain the availability and proper operation of CopTrax.</p>
        <p>However, uninterrupted or error-free availability cannot be guaranteed.</p>
        <p>CopTrax may occasionally become unavailable because of:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Scheduled maintenance;</li>
          <li>System updates;</li>
          <li>Internet or network failures;</li>
          <li>Hosting or third-party service interruptions;</li>
          <li>Security incidents;</li>
          <li>Technical failures; or</li>
          <li>Circumstances reasonably outside NERC's control.</li>
        </ul>
        <p>Where practical, reasonable efforts should be made to restore affected services.</p>
      </LegalSection>

      <LegalSection n={17} title="Third-Party Services">
        <p>
          Certain CopTrax functionality may depend on third-party services, such as hosting, database,
          authentication, email, payment, or artificial-intelligence providers.
        </p>
        <p>The availability and performance of those services may be subject to the respective providers' systems and policies.</p>
        <p>
          NERC is not responsible for failures caused solely by third-party services or circumstances
          outside its reasonable control, except where responsibility cannot legally be excluded.
        </p>
      </LegalSection>

      <LegalSection n={18} title="Intellectual Property and System Use">
        <p>
          CopTrax, including its interface, software, documentation, branding, and other original
          system materials, may be protected by applicable intellectual-property rights.
        </p>
        <p>Access to CopTrax does not transfer ownership of the system to users.</p>
        <p>Users may use CopTrax only for the purposes and access authorized by NERC Copra Trading.</p>
        <p>
          Nothing in these Terms should be interpreted as transferring ownership of a Supplier's
          personal information or independently owned materials to NERC merely because they are
          processed through the system.
        </p>
      </LegalSection>

      <LegalSection n={19} title="Limitation of Liability">
        <p>
          To the extent permitted by applicable law, NERC Copra Trading will not be liable for losses
          caused solely by circumstances reasonably outside its control, such as internet outages,
          third-party service failures, unauthorized activities resulting from a user's intentional
          disclosure of credentials, or events of force majeure.
        </p>
        <p>Nothing in these Terms excludes or limits liability where such exclusion or limitation is prohibited by Philippine law.</p>
        <p>
          This section does not remove NERC's responsibility to exercise reasonable care in operating
          the system or handling information and transactions under its control.
        </p>
      </LegalSection>

      <LegalSection n={20} title="Changes to These Terms">
        <p>
          These Terms may be updated when CopTrax's functionality, business processes, legal
          requirements, or operational practices change.
        </p>
        <p>
          The current version will be made available through CopTrax, and the{" "}
          <span className="font-semibold text-brown-dark">Last Updated</span> date will indicate the
          latest revision.
        </p>
        <p>Where a change materially affects users' rights or obligations, reasonable notice should be provided where appropriate.</p>
      </LegalSection>

      <LegalSection n={21} title="Governing Law">
        <p>
          These Terms and the use of CopTrax are governed by the{" "}
          <span className="font-semibold text-brown-dark">laws of the Republic of the Philippines</span>,
          without prejudice to rights and remedies available under applicable Philippine law.
        </p>
        <p>Any dispute relating to a specific contract or transaction may also be governed by the provisions contained in that contract and applicable law.</p>
      </LegalSection>

      <LegalSection n={22} title="Contact Information">
        <p>Questions, concerns, or reports regarding these Terms or the use of CopTrax may be directed to:</p>
        <div className="pt-1">
          <p className="font-bold text-brown-dark mb-2">NERC Copra Trading</p>
          <ul className="space-y-1.5 text-[14px] sm:text-[15px]">
            <li className="flex items-start gap-2">
              <LuMapPin className="w-4 h-4 text-green-mid shrink-0 mt-0.5" />
              <span>Business Address: <span className="italic text-brown-light">Kumalarang, Zamboanga del Sur</span></span>
            </li>
            <li className="flex items-center gap-2">
              <LuMail className="w-4 h-4 text-green-mid shrink-0" />
              <span>Email: <span className="italic text-brown-light">nerc.copra@gmail.com</span></span>
            </li>
            <li className="flex items-center gap-2">
              <LuPhone className="w-4 h-4 text-green-mid shrink-0" />
              <span>Contact Number: <span className="italic text-brown-light">+63 912 345 6789</span></span>
            </li>
          </ul>
        </div>
      </LegalSection>
    </LegalPageLayout>
  );
}
