# CopTrax — Project Requirements Reference

> Extracted from the capstone paper *"CopTrax: A Web-Based Copra Management System"* (NERC Copra Trading). Chapters 1–2 (Introduction, Related Systems), Bibliography, and personal/administrative appendices (Transmittal Letter, Interview Guide, Curriculum Vitae) were omitted as not relevant to building the site. All embedded images/photos were stripped — text only.

> **Note:** This paper describes a full-stack system (React frontend + Node/Express backend + PostgreSQL). Since this repo is now building the **full application**, not just a landing page, this file is still **background/context only** — it is an earlier capstone-paper draft, predating both `docs/build-spec.md` and the SRS it's built from (SRS v1.0, July 22, 2026). Where anything here conflicts with `docs/build-spec.md`, **`build-spec.md` always wins** — don't pull requirements, schemas, or specific numbers from this file if they contradict it.

> **Known contradictions — do NOT build these, they're superseded:**
> - **Weekly Friday-batched payments** (throughout — "weekly payment computations," "disbursements scheduled every Friday," "Weekly Payment Ready" notification). Superseded: payments are **per-delivery**, one Xendit transaction per delivery, disbursed as soon as the Business Owner approves it — never batched or scheduled. See build-spec.md §3.5.
> - **DocuSeal** for e-signature. Superseded: Suppliers upload their own signature image once at registration; it's reused automatically on future contracts — no third-party e-signature platform. See build-spec.md §3.0/§3.1.
> - **`INVENTORY` table with `Drying`/`Market-Ready` states and `INVENTORY_TRANSACTIONS.transaction_type` including `Transfer`/`Drying to Market-Ready`**. Superseded: inventory uses a Walk-in Holding → Resecada model (`INVENTORY_BATCHES`, `batch_status` ENUM `Walk-in Holding`/`Ready to Merge`/`Resecada`, 14-day merge review by the Business Owner). See build-spec.md §3.6/§4.
> - **`SUPPLIER_PERFORMANCE_SNAPSHOT` with `rejection_rate_pct`, `on_time_delivery_pct`, `contract_completion_rate_pct`, `avg_moisture_pct`, `payment_reliability_pct`, `overall_rank_score`**. Superseded: the rating is the SRS's weighted formula — 60% Contract Fulfillment + 20% Delivered Volume + 20% Copra Quality (Moisture) → 1–5 rating, computed per contract on Completed/Breached. See build-spec.md §3.7.
> - **Node.js/Express.js backend.** Superseded (deliberately, not accidentally): Supabase — Postgres, Supabase Auth, Edge Functions. See build-spec.md §7 for why, and don't "correct" it back.
> - **No mention of Spot Price, automatic multi-contract delivery allocation, or the Non-Contract/cascade mechanics.** These didn't exist yet in this draft. See build-spec.md §3.3/§3.5 for the current (and only) delivery-allocation model — the current SRS's REQ-4.3-9/10 and REQ-4.4-2 through 9 define it, and it has no equivalent here.
> - **`account_status` ENUM uses `'Pending'`** where the current spec uses `'Pending Verification'`. Minor naming drift — use build-spec.md's naming.
>
> Everything else below — the general shape of the ERD, the negotiation/contract/delivery/rating workflow narrative, the UML/use-case description — is still useful *context* for understanding the product's history and intent. Just don't treat specific numbers, table names, or enum values here as current unless build-spec.md also has them.

---

# CHAPTER 3 TECHNICAL BACKGROUND

This chapter describes the technologies, software tools, and architectural approaches used in the development of the proposed Copra Management System for NERC Copra Trading.

**Web-Based Development**

The system is developed as a web-based platform to allow the Business Owner, Supplier, Weigher, and Laboratory Staff to access the system from any internet-enabled device without the need for software installation. This approach simplifies system maintenance and deployment because updates are applied centrally. Given the system's reliance on timely delivery logging, payment processing, and contract status updates, it is built using web technologies that support fast data retrieval and real-time content updates.

**Database Management System**

The system uses PostgreSQL, an open-source relational database management system, to store and manage data related to user accounts, contracts, negotiations, deliveries, inventory, payments, Supplier performance, and procurement reports. PostgreSQL was selected for its reliability, strong support for relational data, ACID-compliant transactions, and compatibility with SQL-based queries. Its structured relational model ensures data integrity while supporting efficient retrieval and management of procurement information.

**Frontend Development**

The user interface is developed using React.js, a JavaScript library for building interactive and component-based web applications. React.js enables real-time dashboard updates, negotiation messaging, contract tracking, delivery monitoring, inventory management, payment history, Supplier performance viewing, and procurement report generation. Its component-based structure allows interface elements to be reused across different parts of the system, contributing to a consistent and maintainable user experience.

**Backend Development**

The system's server-side logic is handled using Node.js with Express.js, a minimalist web application framework for managing API requests, business logic, and communication with the PostgreSQL database. Express.js manages API requests, business logic, PostgreSQL database interactions, contract generation, negotiation processing, delivery and inventory management, payment processing, Supplier performance evaluation, procurement report generation, and JWT-based authentication.

**RESTful API Architecture**

The system follows Representational State Transfer (REST) API principles to facilitate communication between the React.js frontend and the Express.js backend through standard HTTP methods such as GET, POST, PUT, and DELETE. This architecture enables efficient data exchange for the system's core functionalities, including user authentication, price negotiation, contract management, delivery and inventory management, payment processing, Supplier performance evaluation, and procurement reporting. RESTful architecture was selected for its simplicity, scalability, maintainability, and widespread industry adoption, allowing the system to support modular development and future integration with external services such as payment gateways.

**Document Generation**

Contracts, procurement reports, and e-receipts are generated using jsPDF, a JavaScript library for creating PDF documents directly within the web application. For the e-receipt module, html2canvas is used in conjunction with jsPDF to capture receipt content as an image, allowing Suppliers and Business Owners to download e-receipts in either PDF or PNG format.

**Electronic Signature Handling**

Rather than requiring Suppliers to sign each contract individually, the system allows Suppliers to upload a signature image once during account registration. The uploaded image undergoes automatic background removal, converting it into a transparent PNG for clean placement within contract documents. This stored signature is securely retained in the Supplier's account and automatically inserted into future contracts upon agreement, streamlining the contract-signing process while maintaining a consistent and verifiable signature record.

**Payment Gateway Integration**

The system integrates Xendit as its payment gateway to facilitate Supplier payment disbursements. Approved Supplier payment transactions are consolidated through weekly payment computations, with disbursements scheduled every Friday. Xendit securely transfers funds from the Business Owner's account to the Suppliers' registered bank accounts, replacing manual disbursement methods with a secure, traceable, and efficient electronic payment process.

**Security Implementation**

Role-Based Access Control (RBAC) is implemented to ensure that the Business Owner, Supplier, Weigher, and Laboratory Staff can only access features and information relevant to their assigned responsibilities. JSON Web Token (JWT) authentication is used to secure user login sessions and authorize API requests, while HTTPS encrypts data transmitted between clients and the server. Electronic contract signing is secured through DocuSeal, which provides authenticated digital signature workflows and tamper-evident signed documents to help ensure document integrity and the authenticity of supplier signatures.

**Hosting and Deployment**

The system is deployed using Render, which hosts both the frontend and backend to ensure accessibility, reliability, and ease of maintenance. Render supports reliable server-side processing and API availability, allowing the system to remain consistently accessible with minimal manual intervention.

# CHAPTER 4

# DESIGN AND METHODOLOGY 

This chapter describes the research design and methodology, including the conceptual framework, software requirements, budget and cost management, and analysis process.

## 4.1 Conceptual Framework

This section presents the conceptual framework by comparing NERC Copra Trading's existing manual procurement processes with the proposed automated system. Drawing on the information gathered, it identifies key challenges and inefficiencies in contract management, delivery monitoring, and payment processing, then demonstrates how system automation and structured workflows can enhance operational efficiency, accuracy, and transparency.

*Figure 1*. Current Business Process Flowchart

The flowchart above illustrates NERC Copra Trading's current manual procurement process, beginning with Supplier price negotiations conducted through phone calls, followed by contract preparation, copra delivery, weighing, laboratory quality assessment, payment computation, and Supplier payment disbursement. This process depends heavily on manual documentation, paper-based and spreadsheet-based recordkeeping, and direct coordination between the Business Owner and Suppliers, leaving transactions vulnerable to recording errors, delays, and limited visibility into ongoing operations. Without a centralized system, it becomes difficult to monitor contract fulfillment, track delivery progress, and maintain accurate payment records (Jyoti & Akter, 2022). This underscores the need for an automated solution that streamlines documentation, monitoring, and payment processing, while still preserving existing communication practices such as phone-based Supplier negotiations.

  ----------------------------------------------------------------------------------
  
  ----------------------------------------------------------------------------------

  ----------------------------------------------------------------------------------

*Figure 2*. Conceptual Framework

This conceptual framework shows how CopTrax: A Web-Based Copra Management System addresses NERC Copra Trading's reliance on manual, paper-based procurement by unifying Supplier management, contract management, delivery monitoring, inventory management, weekly payment processing, and reporting into a single web-based platform. The Business Owner uses the system to manage Supplier information, finalize and oversee contracts, track deliveries, control inventory, approve payments, and generate procurement reports. Suppliers electronically review and sign contracts and monitor the status of their transactions and payments in real time. Weighers record delivery information at the point of intake, while laboratory staff submit moisture content readings and quality assessment results that directly factor into payment computation. Once the Business Owner approves the weekly payment batch, CopTrax submits a disbursement request to the integrated payment gateway, Xendit, which securely transfers funds to the Suppliers' registered bank accounts and returns the transaction status to the system. Together, these integrated functions replace NERC Copra Trading's fragmented manual coordination with a single, transparent digital workflow, enabling more efficient monitoring of procurement operations.

The workflow begins with the Business Owner creating and managing Supplier contracts, overseeing delivery progress, managing inventory, and approving Supplier payments through CopTrax. Suppliers review and electronically sign these contracts and track the status of their transactions and payments in real time. During each delivery, weighers record the delivery details, while laboratory staff enter moisture content readings and quality assessment results, both of which feed directly into the payment computation. Once the Business Owner confirms the payment, CopTrax submits a disbursement request to the payment gateway, which transfers the funds to the Supplier and returns the transaction status to the system. Throughout the procurement process, CopTrax provides dashboards, reports, transaction updates, and notifications, enabling more efficient procurement monitoring, accurate record management, and improved transparency compared with the existing manual process.

## 4.2 Analysis and Design

This section presents the analysis and design of the proposed system using Unified Modeling Language (UML) and database design diagrams. It illustrates the database structure by defining the entities, attributes, and relationships that support the system's functionality and data management.

*Figure 3.* *Entity Relationship Diagram (ERD) for CopTrax*

The figure above illustrates the ERD for the database structure for CopTrax, designed to streamline the negotiation, contract management, delivery, quality inspection, payment, and inventory management processes. The design is normalized to the Third Normal Form (3NF) to eliminate data redundancy and maintain data integrity across all system modules. The following are 27 interrelated tables covering the six core modules and their respective entities:

1.  **User Management**

    a.  ROLES

> **role_id :** INT (PK)
>
> **role_name :** VARCHAR(30)

b.  USERS

> **user_id :** INT (PK)
>
> **role_id :** INT (FK)
>
> **first_name :** VARCHAR (50)
>
> **last_name :** VARCHAR (50)
>
> **email :** VARCHAR (100)
>
> **phone :** VARCHAR (20)
>
> **address :** VARCHAR (255)
>
> **password_hash :** VARCHAR (255)
>
> **account_status :** ENUM ('Pending', 'Active', 'Rejected', 'Deleted')
>
> **created_at :** DATETIME
>
> **approved_by :** INT (FK)
>
> **approved_at :** DATETIME

c.  USER_VERIFY

> **verify_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **gov_id_file_id :** INT (FK)
>
> **esign_file_id :** INT (FK)
>
> **verify_status :** ENUM ('Pending', 'Approved', 'Rejected')
>
> **review_by :** INT (FK)
>
> **reviewed_at :** DATETIME

d.  LOGIN_HISTORY

**login_id :** INT (PK)

**user_id :** INT (PK)

**login_timestamp :** DATETIME

**ip_address :** VARCHAR (45)

**login_status :** ENUM ('Success', 'Failed')

e.  PASSWORD_RESET

> **reset_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **reset_token :** VARCHAR(255)
>
> **requested_at :** DATETIME
>
> **expires_at :** DATETIME
>
> **used_at :** DATETIME

f.  WALKIN_SUPPLIERS

> **walkin_supplier_id :** INT (PK)
>
> **first_name :** VARCHAR (50)
>
> **last_name :** VARCHAR (50)
>
> **address :** VARCHAR (255)
>
> **phone :** VARCHAR (20)
>
> **recorded_by :** INT (PK)
>
> **created_at :** DATETIME

g.  FILE_UPLOADS

**file_id :** INT (PK)

**uploaded_by :** INT (FK)

> **file_category :** ENUM ('Gov ID', 'Face ID', 'E-Sign', Contract Doc', 'Receipt','Bank QR', 'Other')
>
> **file_name :** VARCHAR (255)
>
> **file_url :** VARCHAR (500)
>
> **file_size :** INT
>
> **uploaded_at :** DATETIME

2.  **Negotiation and Contract Creation**

    a.  CONVERSATIONS

> **conversation_id :** INT (PK)
>
> **supplier_id :** INT (FK)
>
> **business_owner_id :** INT (FK)
>
> **contract_id :** INT (FK)
>
> **status :** ENUM ('Open', 'Closed')
>
> **created_at :** DATETIME

b.  MESSAGES

**message_id :** INT (PK)

**conversation_id :** INT (FK)

**sender_id :** INT (FK)

**message_type :** ENUM ('Text', 'Image', 'File', 'Contract Form')

**message_text :** TEXT

**sent_at :** DATETIME

c.  MESSAGE_ATTACHMENTS

> **attachment_id :** INT (PK)
>
> **message_id :** INT (FK)
>
> **file_id :** INT (FK)

d.  PROPOSAL_FORMS

> **proposal_id :** INT (PK)
>
> **conversation_id :** INT (FK)
>
> **supplier_id :** INT (FK)
>
> **proposed_price_per_kg :** DECIMAL
>
> **proposed_volume_tons :** DECIMAL
>
> **proposal_status :** ENUM ('Pending', 'Accepted', 'Rejected', 'Modified')
>
> **submitted_at :** DATETIME
>
> **reviewed_by :** INT (FK)
>
> **counter_price_per_kg :** DECIMAL
>
> **supersedes_proposal_id :** INT (FK)

e.  CONTRACTS

> **contract_id :** INT (PK)
>
> **contract_number :** VARCHAR (30)
>
> **supplier_id :** INT (FK)
>
> **business_owner_id :** INT (FK)
>
> **negotiated_price_per_kg :** DECIMAL
>
> **contracted_tons :** DECIMAL
>
> **signing_date :** DATE
>
> **due_date :** DATE
>
> **status :** ENUM ('Pending', 'Signed', 'Active', 'Completed', 'Breached')
>
> **created_at :** DATETIME

f.  CONTRACT_SIGNATURES

**signature_id :** INT (PK)

**contract_id :** INT (FK)

**signer_id :** INT (FK)

**signer_role :** ENUM ('Supplier', 'Business Owner')

> **esignature_file_id :** INT (FK)
>
> **signature_order :** INT
>
> **signed_at :** DATETIME

3.  **Delivery and Quality Management**

    a.  DELIVERIES

**delivery_id :** INT (PK)

**delivery_source :** ENUM ('Walkin', 'Contract-based')

**contract_id :** INT (FK)

**walkin_supplier_id :** INT (FK)

**batch_number :** VARCHAR (30)

> **delivery_date :** DATE
>
> **truck_plate_number :**VARCHAR (20)
>
> **weigher_id :** INT (FK)
>
> **lab_staff_id :** INT (FK)
>
> **delivery_status :** ENUM ('Pending', 'Weighed', 'Inspected', 'Accepted', 'Rejected')
>
> **payment_id :** INT (FK)
>
> **created_at :** DATETIME

b.  WEIGHING_RECORDS

> **weighing_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **weigher_id :** INT (FK)
>
> **gross_weight_kg :** DECIMAL
>
> **tare_weight_kg :** DECIMAL
>
> **net_weight_kg :** DECIMAL
>
> **weighed_at :** DATETIME

c.  LABORATORY_INSPECTIONS

> **inspection_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **lab_staff_id :** INT (FK)
>
> **moisture_content_pct :** DECIMAL
>
> **inspected_at :** DATETIME

d.  QUALITY_RESULTS

> **quality_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **inspection_id :** INT (FK)
>
> **result :** ENUM ('Accepted', 'Rejected')
>
> **ai_quality_result :** DECIMAL
>
> **remarks :** VARCHAR (255)
>
> **evaluated_at :** DATETIME

4.  **Payment System**

    a.  PCA_DISCOUNT_TABLE

**discount_id :** INT (PK)

> **moisture_content_pct :** DECIMAL
>
> **discount_value :** DECIMAL
>
> **table_version :** VARCHAR
>
> **effective_date :** DATE

b.  PAYMENTS

> **payment_id :** INT (PK)
>
> **supplier_id :** INT (FK)
>
> **business_owner_id :** INT (FK)
>
> **payment_date :** DATE
>
> **payment_week :** VARCHAR (20)
>
> **total_amount :** DECIMAL
>
> **payment_status :** ENUM ('Pending', 'Released', 'Failed')
>
> **reference_number :** VARCHAR (50)
>
> **payment_method :** ENUM ('Cash', 'Bank Transfer')
>
> **created_at :** DATETIME

c.  PAYMENT_DETAILS

> **payment_detail_id :** INT (PK)
>
> **payment_id :** INT (FK)
>
> **delivery_id :** INT (FK)
>
> **gross_weight_kg :** DECIMAL
>
> **tare_weight_kg :** DECIMAL
>
> **net_weight_kg :** DECIMAL
>
> **moisture_content_pct :** DECIMAL
>
> **moisture_deduction_kg :** DECIMAL
>
> **final_weight_kg :** DECIMAL
>
> **negotiated_price_per_kg :** DECIMAL
>
> **pca_discount_id :** INT (FK)
>
> **pca_discount_amount :** DECIMAL
>
> **line_amount :** DECIMAL

d.  E_RECEIPTS

> **receipt_id :** INT (PK)
>
> **payment_id :** INT (FK)
>
> **receipt_number :** VARCHAR (30)
>
> **file_id :** INT (FK)
>
> **generated_at :** DATETIME

5.  **Inventory Management**

    a.  INVENTORY

> **inventory_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **inventory_type :** ENUM ('Drying', 'Market-Ready')
>
> **current_weight_kg :** DECIMAL
>
> **warehouse_entry_date :** DATE
>
> **drying_start_date :** DATE
>
> **expected_ready_date :** DATE
>
> **market_ready_date :** DATE
>
> **quality_status :** ENUM ('Good', 'Degraded', 'Disposed').

b.  INVENTORY_TRANSACTIONS

**transaction_id :** INT (PK)

**inventory_id :** INT (FK).

> **transaction_type :** ENUM ('Stock In', 'Stock Out', 'Transfer', 'Drying to Market-Ready')
>
> **quantity_kg :** DECIMAL
>
> **transaction_date :** DATETIME
>
> **performed_by :** INT (FK)

c.  INVENTORY_ADJUSTMENTS

> **adjustment_id :** INT (PK)
>
> **inventory_id :** INT (FK)
>
> **adjusted_by :** INT (FK)
>
> **adjustment_reason :** VARCHAR (255)
>
> **old_weight_id :** DECIMAL
>
> **new_weight_id :** DECIMAL
>
> **adjusted_at :** DATETIME

6.  **Dashboard, Analytics, and Notifications**

    a.  SUPPLIER_PERFORMANCE_SNAPSHOT

> **snapshot_id :** INT (PK)
>
> **supplier_id :** INT (FK)
>
> **snapshot_date :** DATE
>
> **rejection_rate_pct :** DECIMAL
>
> **on_time_delivery_pct :** DECIMAL
>
> **contract_completion_rate_pct :** DECIMAL
>
> **avg_moisture_pct :** DECIMAL
>
> **payment_reliability_pct :** DECIMAL
>
> **overall_rank_score :** DECIMAL

b.  NOTIFICATIONS

> **notification_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **notification_type :** ENUM ('Contract Signed', 'Contract Activated', 'Delivery Accepted', 'Delivery Rejected', 'Weekly Payment Ready', 'Payment Released', 'Contract Completed', 'Contract Breached', 'Deadline Reminder', 'Other')
>
> **message :** VARCHAR (255)
>
> **related_entity_type :** VARCHAR (30)
>
> **related_entity_id :** INT
>
> **is_read :** BOOLEAN
>
> **created_at :** DATETIME

c.  AUDIT_LOGS

> **audit_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **action :** VARCHAR (100)
>
> **module :** VARCHAR (50)
>
> **timestamp :** DATETIME
>
> **ip_address :** VARCHAR (45)
>
> **authentication_method :** VARCHAR (50)
>
> **details :** TEXT

**Use Case Diagram**

  ----------------------------------------------------------------------------------
  
  ----------------------------------------------------------------------------------

  ----------------------------------------------------------------------------------

*Figure 4. Use Case Diagram for CopTrax*

Figure 4 presents the use case diagram of CopTrax: A Web-Based Copra Management System, illustrating the interactions among the Supplier, Business Owner, Weigher, Laboratory Staff, and the System during the procurement process.

For the **Supplier**, the system provides account-related functionalities such as registration, login, password recovery, and account information updates. Suppliers can review and electronically sign contracts, monitor contract progress and transaction updates, view payment status, download electronic receipts, and receive notifications. These features allow Suppliers to track their procurement transactions and remain informed of contract and payment progress through a centralized platform.

The **Business Owner** is responsible for managing the core procurement operations of the system. These include managing Supplier accounts, facilitating price negotiations through the integrated chat system, managing contracts, monitoring contract progress, viewing Supplier performance, managing inventory, reviewing and approving weekly Supplier payments, accessing reports and analytics, and monitoring system notifications through the dashboard. The diagram also illustrates the interaction of the **Weigher** and **Laboratory Staff**, where the Weigher submits delivery details while the Laboratory Staff records copra quality assessment results that are used in validating deliveries and supporting payment computation.

In addition to user-initiated processes, the diagram illustrates the automated functions performed by CopTrax. The system processes delivery results, computes Supplier payments based on recorded delivery and quality assessment information, initiates weekly Supplier payment disbursement through the integrated payment gateway after the Business Owner approves the payment batch, and sends notifications to the Business Owner and Suppliers to keep them informed of important procurement activities and transaction updates. Through these interactions, the use case diagram demonstrates how CopTrax integrates user-driven and automated processes to improve procurement efficiency, transaction accuracy, operational transparency, and overall management of Supplier contracts, deliveries, inventory, and weekly payment disbursements.

*Figure 5.* Business Process Model and Notation (BPMN) for Contract Completion via CopTrax

The figure above illustrates the end-to-end operational workflow of the CopTrax system, outlined across four functional swimlanes corresponding to the system's user roles: Supplier, Business Owner, Weigher, and Laboratory Staff. It presents the sequence of activities and interactions among these users, providing a clear representation of the business processes from Supplier registration and contract negotiation to delivery, quality inspection, payment processing, and inventory management.

## 4.3 Development Method

*Figure 6.* Agile Development Model

As illustrated in Figure , the Agile Development Model will be used in the development of the proposed system. The model emphasizes iterative and incremental development, allowing continuous improvement and stakeholder feedback throughout the software development life cycle (Singh, 2025).

**Planning**

During the planning phase, the researchers will identify the project's objectives, scope, functional and non-functional requirements, target users, and development timeline. Meetings with the client will be conducted to gather initial requirements and determine the major modules of CopTrax: A Web-Based Copra Management System for NERC Copra Trading.

**Analysis**

After the planning stage, the researchers will analyze the gathered requirements to identify system requirements, identify potential issues and risks, and determine the necessary features of the proposed system. This phase includes gathering and evaluating requirements from the Business Owner, Suppliers, weighers, and laboratory personnel, as well as prioritizing user stories to guide the iterative development of CopTrax.

**Design**

During the design phase, the researchers will transform the gathered requirements into a detailed system design. This includes developing the system architecture, database schema, user interface prototypes, and process models that define how users, data, and system components will interact. The design will serve as the blueprint for developing CopTrax while ensuring that the system is functional, secure, user-friendly, and aligned with the operational processes of NERC Copra Trading. []{.mark}

**Implementation (Development & Iterations)**

During the implementation phase, the researchers will translate the approved system design into a functional web-based application through iterative development. Each iteration will focus on developing, integrating, and refining specific functionalities based on the prioritized user stories and project requirements. At the end of every iteration, the implemented functionalities will be reviewed, tested, and enhanced based on stakeholder feedback before proceeding to the next development cycle.

**Verification, Validation, and Testing**

During this phase, the researchers will conduct verification, validation, and testing to ensure that the system functions according to the specified requirements. Unit testing, integration testing, system testing, and User Acceptance Testing (UAT) will be conducted with the Business Owner, Suppliers, weighers, and laboratory personnel to identify defects, evaluate system performance, and verify that the system meets user requirements.

**Deployment**

Once the system has successfully passed all testing phases, it will be deployed in the intended operating environment. The researchers will configure the system, prepare user accounts, and assist users during the initial implementation to ensure a smooth transition and proper system utilization.

**Maintenance and Continuous Improvement**

After deployment, the researchers will continuously monitor the system to identify issues, improve performance, and implement necessary enhancements based on user feedback. Corrective updates and feature improvements will be carried out to maintain the system's functionality, security, reliability, and adaptability to the evolving operational needs of NERC Copra Trading.

## 4.4 Development Approach

*Figure 7.* Agile Development Approach

As illustrated in Figure 7, the Agile methodology will guide the development of the proposed system, allowing features to be built and refined in short development cycles based on continuous feedback.

**Sprint Planning**

During each sprint planning session, the researchers will identify, prioritize, and organize the system requirements into manageable tasks. Each sprint will focus on developing specific functionalities based on the project's priorities, ensuring that development goals are clearly defined before implementation begins.

**Iterative Development**

The researchers will develop the system incrementally by completing prioritized functionalities during each sprint. System components will be designed, integrated, and refined progressively, allowing each completed increment to contribute to the overall functionality of the web-based system.

**Continuous Testing and Feedback**

At the end of every sprint, the developed functionalities will undergo testing to verify their correctness, performance, and integration with existing modules. Feedback from the client and intended users will be collected and evaluated to identify necessary improvements before proceeding to the succeeding sprint.

**Deployment and Maintenance**

Once the developed functionalities have met the required quality standards, the system will undergo final deployment in the intended operating environment. Following deployment, the researchers will continuously monitor the system, address identified issues, and implement enhancements based on user feedback to maintain its functionality, reliability, and security.

## 4.5 Software Development Tools

This section presents the software development tools that will be used to design, develop, test, and deploy the proposed system.

*Table 2: List of Software Development Tools*

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Software**           **Version**   **Link**                                                                         **Use**
  ---------------------- ------------- -------------------------------------------------------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------
  Visual Studio Code     Latest        [[https://code.visualstudio.com/]{.underline}](https://code.visualstudio.com/)   Integrated Development Environment (IDE)

  React.js               Latest        [[https://react.dev/]{.underline}](https://react.dev/)                           JavaScript library for building interactive user interfaces.

  Tailwind CSS           Latest        [[https://tailwindcss.com]{.underline}](https://tailwindcss.com/)                Utility-first CSS framework

  Express.js             Latest        [[https://expressjs.com/]{.underline}](https://expressjs.com/)                   Minimalist web application framework for Node.js used to develop RESTful APIs and server-side logic.

  Node.js                Latest        [[https://nodejs.org/]{.underline}](https://nodejs.org/)                         JavaScript runtime environment used to execute server-side application logic.

  PostgreSQL             Latest        [[https://www.postgresql.org/]{.underline}](https://www.postgresql.org/)         Open-source relational database management system used for storing and managing system data.

  DocuSeal               Latest        [[https://www.docuseal.com/]{.underline}](https://www.docuseal.com/)             Electronic signature platform used to facilitate secure contract signing, document verification, and tamper-evident signed contracts.

  JSON Web Token (JWT)   Latest        [[https://jwt.io/]{.underline}](https://jwt.io/)                                 Token-based authentication mechanism used to verify user identities and secure protected system routes.

  Xendit                 Latest        [[https://www.xendit.co/en-ph/]{.underline}](https://www.xendit.co/en-ph/)       Payment gateway used for weekly supplier payment disbursements.

  Render                 Latest        [[https://render.com/]{.underline}](https://render.com/)                         Cloud hosting platform for deploying the frontend and backend applications.

  Git                    Latest        [[https://git-scm.com/]{.underline}](https://git-scm.com/)                       Version control

  GitHub                 Latest        [[https://github.com/]{.underline}](https://github.com/)                         Repository hosting and collaboration platform

  Axios                  Latest        [[https://axios-http.com/]{.underline}](https://axios-http.com/)                 HTTP client library for communication between the frontend and backend APIs.
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.6 Project Management

This section presents the schedule and timeline, roles and responsibilities, and budget and cost management of the study.

### 4.6.1 Schedule and Timeline

> This section shows the schedule and timeline from the start until the study would be completed.

*Table 3: Gantt Chart of Activities, S.Y. 2025-2026*

<table style="width:100%;">
<colgroup>
<col style="width: 38%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
<col style="width: 5%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>MONTH</strong></th>
<th colspan="3"><strong>JUNE</strong></th>
<th colspan="4"><strong>JULY</strong></th>
<th colspan="4"><strong>AUGUST</strong></th>
</tr>
<tr class="odd">
<th><strong>WEEK</strong></th>
<th>2</th>
<th>3</th>
<th>4</th>
<th>1</th>
<th>2</th>
<th>3</th>
<th>4</th>
<th>1</th>
<th>2</th>
<th>3</th>
<th>4</th>
</tr>
<tr class="header">
<th>Pitching Ideas/Finding Clients</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="odd">
<th>Consult Adviser for Final Topic</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="header">
<th><p>Chapter 2, Chapter 3, and</p>
<p>Bibliography</p></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="odd">
<th><p>Research Objectives/</p>
<p>Statement of the Problem</p></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="header">
<th><p>Chapter 4 Design and</p>
<p>Methodology</p></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="odd">
<th><p>Appendices (Transmittal Letter,</p>
<p>Interview Guide or Questionnaire, Software Requirement Specifications) and CV</p></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="header">
<th>Chapter 1 and Abstract</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="odd">
<th><p>Proposal Document Draft Chapter 1-4</p>
<p>with References, Appendices, CV</p></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="header">
<th>Submission of the 3 Copies of Capstone Proposal Document &amp; Sworn and Recommendation Letter</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="odd">
<th>Capstone Proposal Defense</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="header">
<th>Submission of Rubric 1, 2.1, &amp; 2.2</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
<tr class="odd">
<th>Submission of Revised Capstone Document and Compliance Form</th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
<th></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

*Table 4: Gantt Chart of Activities, S.Y. 2026-2027*

  --------------------------------------------------------------------------------------------------------------------------------------------------------------
  **MONTH**                 **AUGUST**               **SEPTEMBER**               **OCTOBER**               **NOVEMBER**               **DECEMBER**           
  ------------------------- ------------ --- --- --- --------------- --- --- --- ------------- --- --- --- -------------- --- --- --- -------------- --- --- ---
  **WEEK**                  1            2   3   4   1               2   3   4   1             2   3   4   1              2   3   4   1              2   3   4

  **DEVELOPMENT**                                                                                                                                            

  Database Setup                                                                                                                                             

  Frontend Coding                                                                                                                                            

  Backend Coding                                                                                                                                             

  **TESTING**                                                                                                                                                

  Black Box Testing                                                                                                                                          

  System Testing                                                                                                                                             

  User Acceptance Testing                                                                                                                                    

  **MAINTENANCE**                                                                                                                                            

  System Hosting                                                                                                                                             

  Project Defense                                                                                                                                            
  --------------------------------------------------------------------------------------------------------------------------------------------------------------

### 4.6.2 Responsibilities

> This section describes the roles and responsibilities of each member of the study.

*Table 5: Roles and Responsibilities*

  -----------------------------------------------------------------------------------
  **Member**                 **Role**                       **Module**
  -------------------------- ------------------------------ -------------------------
  Ma. Keisha Atiga           Front and Back-end Developer   Weigher Module

  Regine Christian Buenafe   Front and Back-end Developer   Business Owner Module

  Maria Michaela Dionson     Front and Back-end Developer   Supplier Module

  Cindy Lepatan              Front and Back-end Developer   Laboratory Staff Module
  -----------------------------------------------------------------------------------

**4.6.3 Budget and Cost Management**

This section presents the proposed budget of the study.

*Table 6: Proposed Budget and Cost*

  -----------------------------------------------------------------------
  **Description**                     **Cost**
  ----------------------------------- -----------------------------------
  Website Hosting                     PHP 4,500.00

  Computer                            PHP 50,000.00

  Tablet                              PHP 12,000

  Man Hours                           PHP 73,600.00

  Internet Connection                 PHP 2,500.00

  Total                               PHP 142,600.00
  -----------------------------------------------------------------------

## 

## 4.7 Verification, Validation, and Testing

To ensure that CopTrax: A Web-Based Copra Management System for NERC Copra Trading meets its functional requirements and performs as intended, the researchers will conduct black-box testing. Black-box testing evaluates the system's functionalities based on user inputs and expected outputs without considering the internal source code. It enables the researchers to identify functional errors, missing features, and inconsistencies that may affect the system's overall performance.

Black-box testing will be carried out by four independent testers with experience in web application development. They will evaluate the functionalities available to each user role, namely the Business Owner, Supplier, Weigher, and Laboratory Staff. The testing will cover major system functionalities, including user authentication, price negotiation, contract management, delivery and inventory management, quality assessment, payment management, supplier performance evaluation, and procurement reporting. Both valid and invalid test cases will be executed to verify that the system responds correctly under different conditions.

To determine whether the system satisfies user requirements and is suitable for its intended environment, the researchers will conduct User Acceptance Testing (UAT). The evaluation will involve 15 participants, consisting of 1 Business Owner, 11 Suppliers, 1 Weigher, and 1 Laboratory Staff. Each participant will evaluate the system based on their assigned role by performing tasks relevant to their responsibilities within the procurement workflow. Their feedback will be collected through an evaluation instrument to assess the system's functionality, usability, and overall acceptability.

The results of the verification, validation, and testing activities will be analyzed to identify issues requiring improvement before the final deployment of the system. Any defects or inconsistencies identified during testing will be corrected to ensure that CopTrax provides reliable, secure, and efficient support for the contract management, delivery and inventory management, quality assessment, supplier performance evaluation, and weekly payment disbursement processes of NERC Copra Trading.

# GLOSSARY

This section provides operational definitions of key terms used throughout this study. The glossary is intended to help readers understand the concepts, technologies, and business processes discussed in the documentation. The terms are arranged alphabetically.

**Accepted Delivery** - A copra delivery that satisfies the required quality standards based on the standard moisture content assessment and is approved for inventory recording and payment computation.

**Batch Delivery** - A quantity of copra delivered by a Supplier at a specific time as part of a Supplier contract. Multiple batch deliveries may be completed until the agreed contract quantity is fulfilled.

**Breached Contract** - A Supplier contract that is marked as violated when the Supplier fails to fulfill the agreed contractual obligations, such as delivering the required quantity of copra within the specified contract period. A breached contract is automatically identified by the system once the contract deadline has passed without full completion of the agreed deliveries.

**Business Owner** - The primary user responsible for managing procurement activities, including Supplier management, contract administration, inventory monitoring, payment approval, report generation, and overall system supervision.

**Cloud Hosting** - An internet-based hosting service that deploys CopTrax on cloud infrastructure, enabling secure access through modern web browsers.

**Contract Fulfillment** - The process of monitoring whether a Supplier has completed the agreed quantity of copra deliveries within the contract period.

**Copra** - Dried coconut meat used as the primary raw material for coconut oil and other coconut-based products.

**CopTrax** - The proposed web-based copra management system developed to automate Supplier management, contract management, delivery and inventory management, payment computation, weekly payment disbursement, supplier performance evaluation, and procurement reporting for NERC Copra Trading.

**Delivery Management** - The process of recording, monitoring, and validating copra deliveries received from Suppliers based on the agreed contract.

**Delivery Record** - A digital record containing information about a copra delivery, including Supplier details, delivery date, truck weight, tare weight, net weight, and quality assessment results.

**DocuSeal** - An electronic signature platform integrated into CopTrax to facilitate secure digital contract signing, document verification, and tamper-evident signed contracts.

**Electronic Receipt (E-Receipt)** - A system-generated document that serves as proof of payment after a successful Supplier payment disbursement.

**Inventory Management** - The process of recording, updating, and monitoring accepted copra deliveries to maintain accurate inventory records.

**JSON Web Token (JWT)** - A token-based authentication mechanism used to verify user identities, authorize access to protected system resources, and maintain secure user sessions.

**Laboratory Staff** - An authorized user responsible for conducting moisture content analysis, recording laboratory results, and determining whether a copra delivery satisfies the required quality standards.

**Moisture Content** - The amount of moisture present in delivered copra, measured by the laboratory to determine delivery acceptance and support payment computation.

**Notification** - A system-generated message that informs users about contract updates, delivery status, weekly payment disbursements, and other procurement-related activities.

**Payment Computation** - The process of calculating the amount payable to a Supplier based on the accepted delivery quantity, applicable quality deductions, and the agreed contract price.

**Payment Disbursement** - The electronic release of approved Supplier payments through the integrated payment gateway during the scheduled weekly payment disbursement process.

**Payment Gateway** - A third-party financial service integrated into the system to facilitate secure weekly electronic payment disbursements from the Business Owner to Suppliers.

**PostgreSQL** - An open-source relational database management system used to store and manage user accounts, contracts, negotiations, deliveries, inventory records, payment transactions, supplier performance data, and other procurement information within the system.

**Procurement** - The business process of acquiring raw copra from Suppliers through contract negotiation, delivery, quality assessment, inventory recording, payment computation, and weekly payment disbursement.

**Procurement Report** - A system-generated summary that presents procurement-related information such as Supplier deliveries, inventory records, payment transactions, and contract progress.

**Quality Assessment** - The laboratory inspection performed on delivered copra to determine whether it meets the required moisture content standards.

**Rejected Delivery** - A copra delivery that fails to satisfy the required quality standards and is therefore not accepted for payment or inventory recording.

**Role-Based Access Control (RBAC)** - A security mechanism that restricts access to system functions and information based on the responsibilities assigned to each user role.

**Supplier** - An external user who enters into procurement contracts with NERC Copra Trading and delivers copra based on agreed contract terms.

**Supplier Contract** - A formal agreement between the Business Owner and a Supplier specifying the agreed procurement terms, including contract quantity, price, delivery period, and other conditions.

**Supplier Performance** - A measure of a Supplier's procurement performance based on contract fulfillment, delivery completion, quality assessment results, and overall transaction history.

**Transaction History** - A chronological record of a Supplier's contracts, deliveries, payments, and procurement activities maintained within the system.

**Weigher** - An authorized user responsible for recording delivery information, including truck weight, tare weight, net weight, Supplier information, and delivery details.

**Weekly Disbursement** - The scheduled release of approved Supplier payments every Friday after payment computations have been reviewed and approved by the Business Owner.

**Workflow** - The structured sequence of procurement activities performed within the system, beginning with Supplier contract management and continuing through delivery recording, quality assessment, payment computation, weekly payment disbursement, inventory updating, and procurement reporting.

**Xendit** - The integrated payment gateway used by the system to facilitate secure electronic fund transfers to Suppliers through supported banking services.

# APPENDIX C 

## SOFTWARE REQUIREMENTS SPECIFICATIONS (SRS) 

**Software Requirements**

**Specification**

IEEE 830 / ISO·IEC·IEEE 29148 Format

**CopTrax: A Web-Based Copra Management System for NERC Copra Trading**

Version 1.0

July 22, 2026

By

Ma. Keisha L. Atiga

Regine Christian L. Buenafe

Maria Michaela S. Dionson

Cindy T. Lepatan

Christine Peña

Faculty Adviser

**Revision History**

  ---------------------------------------------------------------------------------------
  **Date**     **Version**   **Description**           **Author**
  ------------ ------------- ------------------------- ----------------------------------
  07/22/26     1.0           Initial draft             Buenafe, Atiga, Dionson, Lepatan

  ---------------------------------------------------------------------------------------

#  

# Introduction

## 1.1 Purpose

> This Software Requirements Specification (SRS) document provides a comprehensive description of the functional and non-functional requirements of CopTrax: A Web-Based Copra Management System to be developed for NERC Copra Trading. The proposed system aims to improve the management of procurement operations by centralizing user management, price negotiation and contract agreements, contract management, delivery management, inventory management, online payment disbursement, Supplier performance rating, and procurement analytics into a single web-based platform.
>
> This SRS serves as the primary reference for the design, development, implementation, testing, and maintenance of the proposed system. It provides stakeholders with a clear understanding of the system's functionality and operational requirements and serves as the basis for system verification and validation throughout the software development process.

## 1.2 Document Conventions

This document follows these conventions:

  -----------------------------------------------------------------------------------------------------------------
  **Term**        **Description**
  --------------- -------------------------------------------------------------------------------------------------
  **SHALL**       Indicates a mandatory requirement that must be implemented by the system.

  **SHOULD**      Indicates a recommended requirement that is desirable but not mandatory.

  **MAY**         Indicates an optional requirement that can be implemented if applicable.

  **TBD**         Indicates information that has not yet been finalized and will be provided in future revisions.

  **Note**        Provides additional information or clarification regarding a requirement.
  -----------------------------------------------------------------------------------------------------------------

Requirements are categorized as follows:

  ----------------------------------------------------------------------------
  **Requirement Number**   **Description**
  ------------------------ ---------------------------------------------------
  **FR-XX**                Functional Requirements

  **NFR-XX**               Non-Functional Requirements

  **IR-XX**                Interface Requirements

  **DR-XX**                Data Requirements

  **SR-XX**                Security Requirements
  ----------------------------------------------------------------------------

## 1.3 Intended Audience

This document is intended for the following stakeholders:

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stakeholder**                     **Role**
  ----------------------------------- --------------------------------------------------------------------------------------------------------------------------------
  **Business Owner**                  Validates that the system requirements align with the business' procurement processes and operational needs.

  **Project Adviser**                 Reviews the requirements and provides technical and academic guidance throughout the development process.

  **Panel Members**                   Evaluate the completeness, feasibility, and compliance of the proposed system with the project objectives and requirements.

  **Project Proponents**              Design, develop, test, and document the proposed system based on the specified requirements.

  **Future Developers/Maintainers**   Use this document as a reference for future system enhancements, maintenance, or further development after project completion.
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 1.4 Product Scope

> CopTrax: A Web-Based Copra Management System is developed for NERC Copra Trading to improve the management of procurement operations by replacing manual processes with a centralized web-based platform. The system aims to streamline procurement activities by automating contract management, delivery monitoring, inventory management, payment processing, Supplier performance evaluation, and procurement reporting.

**In Scope**

> The system includes the following major components:

-   **User Management:** Registration, authentication, role-based access control, and account management for Business Owners, Suppliers, Weighers, and Laboratory Staff.

-   **Price Negotiation and Contract Agreement Chat System:** An Integrated chat system for negotiating contract terms and generating Supplier contracts where Suppliers can also sign.

-   **Contract Management:** Creation, monitoring, and tracking of Supplier contracts, including contract status and fulfillment monitoring.

-   **Delivery Management:** Recording and monitoring of copra deliveries, accepted quantities, and contract fulfillment progress.

-   **Inventory management:** Recording and monitoring of accepted copra deliveries and inventory levels.

-   **Payment Management:** Automated payment computation based on accepted delivery quantities, quality adjustments, and agreed contract prices, with online payment disbursement through an integrated payment gateway.

-   **Supplier Performance Rating:** Evaluation of Supplier performance based on contract compliance, delivery volume, and quality criteria.

-   **Procurement Analytics:** Dashboards, reports, and notifications that provide real-time summaries of procurement activities and Supplier performance.

> **Out of Scope**

-   Automated moisture content measurement and weighing equipment integration.

-   Laboratory testing and quality assessment beyond recording laboratory results.

-   Transportation fleet management, vehicle tracking, and warehouse logistics.

-   Copra processing, manufacturing, and post-procurement operations.

-   Automatic retrieval of market or spot prices from external sources.

-   Integration with external enterprise systems not specified in this study.

## 1.5 Reference

> This Software Requirements Specification (SRS) is based on the following documents and sources:

1.  IEEE Computer Society. (2018). *ISO/IEC/IEEE 29148:2018 Systems and Software Engineering---Life Cycle Processes---Requirements Engineering.* ISO/IEC/IEEE.

2.  IEEE Computer Society. (1998). *IEEE Recommended Practice for Software Requirements Specifications (IEEE Std 830-1998).* IEEE.

3.  Capstone Project Proposal: *CopTrax: A Web-Based Copra Management System.*

4.  NERC Copra Trading. (2026). Business process interview transcripts, workflow documentation, and system requirements gathered through interviews and on-site observation.

# Overall Description

## 2.1 Product Perspective

> CopTrax is a new, independent web-based copra management system developed for NERC Copra Trading. The system is designed to replace the business's existing manual procurement process, which relies on paper-based records, spreadsheets, calculators, and informal communication. By centralizing procurement activities into a single platform, the system improves the management of Supplier information, contract agreements, deliveries, inventory, payment processing, Supplier performance evaluation, and procurement reporting.
>
> The system integrates with an online payment gateway to facilitate electronic payment disbursements and uses electronic signatures to support digital contract agreements. Aside from these external services, CopTrax functions as a standalone web application that serves as the primary platform for managing procurement operations.

## 2.2 Product Functions

The major functions of CopTrax include:

1.  **User Management**

-   User registration and authentication

-   Role-based access control for Business Owner, Supplier, Weigher, and Laboratory Staff

-   User profile management

-   Password recovery and account management

2.  **Price Negotiation and Contract Agreement Chat System**

-   Real-time messaging between the Business Owner and Supplier

-   Price negotiation through an integrated chat system

-   Exchange of negotiation details and agreements

-   Generation of a contract after successful negotiation

-   Electronic signature support

3.  **Contract Management**

-   Contract monitoring and management

-   Contract status management

-   Contract status management (Active, Completed, Breached)

-   Contract viewing and downloading

4.  **Contract Management**

-   Delivery recording and monitoring

-   Contract fulfillment tracking

-   Inventory recording and updates

-   Inventory availability monitoring

-   Delivery history management

5.  **Payment Management**

-   Payment computation based on contract terms and quality assessment results

-   Online payment disbursement through a payment gateway

-   Payment status monitoring

-   Electronic receipt generation

-   Payment history management

6.  **Payment Management**

-   Supplier performance evaluation

-   Contract compliance assessment

-   Delivery volume fulfillment assessment

-   Quality-based Supplier rating

-   Supplier performance history monitoring

7.  **Procurement Analytics and Notifications**

-   Procurement dashboard and analytics

-   Contract, delivery, inventory, and payment reports

-   Supplier performance reports

-   System-generated notifications and reminders

-   Procurement activity monitoring

## 2.3 User Classes and Characteristics

1.  **Business Owner**

-   Primary administrator of the platform

-   Responsible for Supplier management, contract approval, payment disbursement, and procurement monitoring

-   Possesses advanced knowledge of business procurement processes

-   Primary needs: Contract management, procurement analytics, Supplier monitoring, and payment management

2.  **Supplier**

-   Individuals or organizations supplying copra to the business

-   Uses the system to negotiate contract terms and monitor transactions

-   Basic computer literacy and internet access required

-   Primary needs: Contract signing, delivery tracking, payment monitoring, and transaction history

3.  **Weigher**

-   Personnel responsible for recording delivery information

-   Uses the system during copra deliveries

-   Basic computer literacy

-   Primary needs: Delivery recording, contract fulfillment updates, and delivery history

4.  **Laboratory Staff**

-   Personnel responsible for recording copra quality assessment results

-   Encodes laboratory findings used for payment computation

-   Familiar with laboratory testing procedures

-   Primary needs: Quality assessment encoding and laboratory record management

## 2.4 Operating Environment

> The platform will operate in the following environment:

1.  **Technical Environment**

-   A web-based application accessible through standard web browsers.

-   Responsive interface compatible with desktop and laptop computers.

-   Hosted on a cloud-based platform.

-   Secure communication through HTTPS for data transmission

2.  **Hardware Environment**

-   Server infrastructure capable of supporting multiple concurrent users.

-   Desktop computers, laptops, and tablets for accessing the web-based application.

-   Stable internet connectivity to support real-time transactions and communication.

-   Cloud storage for contracts, electronic signatures, and procurement records.

-   Reliable network infrastructure to ensure continuous system availability.

3.  **User Environment**

-   Accessible through modern web browsers such as Google Chrome, Microsoft Edge, Mozilla Firefox, and Safari.

-   Compatible with Windows, macOS, and Linux operating systems.

-   Requires a stable internet connection.

-   Intended for Business Owners, Suppliers, Weighers, and Laboratory Staff with basic computer literacy.

## 2.5 Operating Environment

> The following constraints will impact the design and implementation of the platform:

1.  **Technical Constraints**

-   The system shall be developed using React.js for the frontend and Express.js running on Node.js for the backend.

-   PostgreSQL shall be used as the primary relational database management system.

-   JSON Web Token (JWT) shall be implemented for user authentication and authorization.

-   The system shall integrate with the Xendit API for online payment disbursement.

-   The system shall require a stable internet connection for real-time communication and online transactions.

2.  **Regulatory Constraints**

-   The system shall comply with the Data Privacy Act of 2012 (Republic Act No. 10173)

-   Personal, financial, and transaction data shall be protected against unauthorized access.

-   Electronic contracts and records shall be managed in accordance with applicable Philippine laws governing electronic transactions.

3.  **Business Constraints**

-   The system shall support only the procurement operations of NERC Copra Trading.

-   Supplier price negotiations shall be conducted through the integrated chat system.

-   Payment computation shall follow the business rules established by NERC Copra Trading.

-   Online payment disbursement shall only be processed after contract approval and delivery validation.

4.  **User Constraints**

-   Users shall possess basic computer literacy to operate the web-based application.

-   Access to system functions shall be restricted based on assigned user roles and permissions.

-   Authorized personnel shall be responsible for accurately encoding procurement, delivery, inventory, and laboratory information.

## 2.6 Assumptions and Dependencies

> The development and operation of the platform are based on the following assumptions and dependencies.
>
> **Assumptions**

1.  Business Owners, Suppliers, Weighers, and Laboratory Staff will actively utilize the system during procurement operations.

2.  Users will have access to compatible devices, and a stable internet connection.

3.  Authorized personnel will accurately encode procurement, delivery, inventory, and laboratory data.

4.  NERC Copra Trading will provide complete and accurate business requirements through system development.

5.  Users will receive appropriate orientation or training before system deployment.

**Dependencies**

1.  Availability of the PostgreSQL database server for storing and managing system data.

2.  Availability of the Xendit API for processing online payment disbursements.

3.  Availability of hosting services provided by Render for deploying the web application.

4.  Availability of internet connectivity for accessing the system and communication with external services.

5.  Continued availability and maintenance of third-party services and APIs used by the platform.

# External Interface Requirements

## 3.1 User Interfaces

> The platform shall provide the following user interfaces:

1.  **Authentication Interface**

-   Login page for registered users.

-   Registration page for Suppliers.

-   Forgot password and password reset functionality.

-   Secure authentication using JSON Web Token (JWT)

2.  **Dashboard Interface**

-   Role-specific dashboards for Business Owner, Supplier, Weigher, and Laboratory Staff.

-   Navigation menu for accessing authorized system modules.

-   Dashboard summaries of contracts, deliveries, inventory, payments, Supplier performance, and system notifications.

-   Procurement reports and analytics displayed through interactive charts and summary cards.

-   Search, filtering, and data visualization for monitoring procurement activities.

3.  **Procurement Interface**

-   Integrated chat interface for Supplier price negotiation.

-   Contract creation and electronic signature interface.

-   Contract monitoring and status management.

-   Delivery recording and inventory management pages.

4.  **Payment Interface**

-   Payment computation page

-   Online payment disbursement interface through Xendit.

-   Electronic receipt viewing and downloading.

-   Payment status and transaction history

5.  **Common Interface Requirements**

-   Responsive web interface compatible with desktop computers, laptops, and tablets.

-   Consistent navigation menus, layouts, and color schemes across all modules.

-   Standard action buttons including Add, Edit, Delete, Save, Cancel, Search, Filter, View, and Download.

-   Form validation with descriptive error messages for invalid or incomplete inputs.

## 3.2 Hardware Interfaces

> The platform shall support the following hardware interfaces:

1.  **Client Devices**

-   Desktop computers

-   Laptop computers

-   Tablets

2.  **Server Infrastructure**

-   Cloud-hosted application server

-   Database server for PostgreSQL

-   Internet-connected devices for system access

3.  **Network Interfaces**

-   Internet connectivity for communication between client devices and the application server

-   Secure communication for payment gateway integration and electronic transactions

## 3.3 Software Interfaces

> The platform shall interface with the following software components:

1.  **Database Management System**

-   PostgreSQL for storing user accounts, contracts, deliveries, inventory, payments, and procurement recording.

2.  **Authentication**

-   JSON Web Token (JWT) for authentication and authorization.

-   Password encryption using industry-standard hashing algorithms.

3.  **Payment Gateway**

-   Xendit API for processing online payment disbursements and transaction status updates.

4.  **Development Framework**

-   React.js for frontend development

-   Express.js running on Node.js for backend services.

-   Axios for API communication between frontend and backend components.

5.  **Development Tools**

-   Git for version control.

-   GitHub for repository hosting and collaboration.

-   Visual Studio Code as the integrated development environment.

## 3.4 Communications Interfaces

> The platform shall support the following communication interfaces:

1.  **Web Communication**

-   HTTPS protocol for secure communication between client devices and the web application.

-   RESTful APIs for communication between the frontend and backend services.

-   JSON format for data exchange between system components.

2.  **Payment Communication**

-   Secure API communication with the Xendit payment gateway.

-   Real-time transaction status updates from the payment service.

3.  **Notification Communication**

-   Email notifications for contract updates, payment status, and system-generated alerts.

-   In-system notifications for procurement-related activities and reminders.

4.  **Security**

-   Encrypted communication using TLS/HTTPS.

-   JWT-based authentication for protected API endpoints.

-   Role-based authorization for accessing system resources.

# System Features

> This section describes the major functional features of the CopTrax: A Web-Based Copra Management System. Each feature is presented in a logical sequence and includes a description, priority level, and a set of functional requirements. Each requirement is assigned a unique identifier to facilitate traceability, verification, and maintenance throughout the software development life cycle.

## 4.1 User Management

> **4.1.1 Description and Priority**
>
> The User Management feature provides secure account registration, authentication, profile management, and role-based access control for Business Owners, Suppliers, Weighers, and Laboratory Staff. It ensures that authorized users can securely access system functionalities according to their assigned roles and permissions.
>
> **Priority:** High
>
> **4.1.2 Stimulus/Response Sequences**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                                        **System Response**
  ------------------------------------------------------------------- -----------------------------------------------------------------------------------------------------------------
  User selects the **Register** option.                               The system displays the registration form.

  User submits valid registration information.                        The system validates the input and creates a new user account.

  User submits incomplete or invalid registration information.        The system displays appropriate validation messages and request correction.

  User logs in using valid credentials.                               The system authenticates the user and redirects them to the appropriate dashboard based on their assigned role.

  User enters incorrect login credentials                             The system denies authentication and displays an error message.

  User selects the **Forgot Password** option.                        The system denies authentication and displays an error message.

  User updates their email address, contact number, or address.       The system validates the input and saves the updated contact information.

  User changes the account password.                                  The system verifies the current password and updates the account with the new password.

  User logs out of the system.                                        The system terminates the active session and redirects the user to the login page.

  The Business Owner creates a Weigher or Laboratory Staff account.   The system validates the input and creates the staff account with the assigned role.
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.1.3 Functional Requirements**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**         **Requirement Description**                                                                                                                                               **Priority**
  -------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------
  REQ-4.1-1      The system **SHALL** allow Suppliers to register an account.                                                                                                              High

  REQ-4.1-2      The system **SHALL** allow the Business Owner to create Weigher and Laboratory Staff accounts.                                                                            High

  REQ-4.1-3      The system **SHALL** require Supplier to provide their first name, last name, email address, contact number, and password during registration.                            High

  REQ-4.1-4      The system **SHALL** require Suppliers to upload a valid government-issued identification card during account registration for identity verification.                     High

  REQ-4.1-5      The system **SHALL** require Suppliers to upload their electronic signature during account registration for use in contract signing.                                      High

  REQ-4.1-6      The system **SHALL** validate the uniqueness of the user's email address before creating an account.                                                                     High

  REQ-4.1-7      The system **SHALL** create newly registered Supplier accounts with a Pending Verification status.                                                                        High

  REQ-4.1-8      The system **SHALL** display a notification informing Suppliers that their registration is pending approval by the Business Owner.                                        High

  REQ-4.1-9      The system **SHALL** prevent Suppliers with a Pending Verification status from accessing the Supplier dashboard and other protected system features.                      High

  REQ-4.1-10     The system **SHALL** allow the Business Owner to review the Supplier's registration details, uploaded government-issued identification card, and electronic signature.   High

  REQ-4.1-11     The system **SHALL** allow the Business Owner to approve or reject Supplier registration requests.                                                                        High

  REQ-4.1-12     The system **SHALL** send an email notification informing the Supplier that their registration has been approved and that they may now access their account.              High

  REQ-4.1-13     The system **SHALL** send an email notification informing the Supplier that their registration has been rejected.                                                         High

  REQ-4.1-14     The system **SHALL** authenticate users using their registered email address and password.                                                                                High

  REQ-4.1-15     The system **SHALL** generate a JSON Web Token (JWT) after successful authentication.                                                                                     High

  REQ-4.1-16     The system **SHALL** enforce role-based access control for Business Owners, Suppliers, Weighers, and Laboratory Staff.                                                    High

  REQ-4.1-17     The system **SHALL** allow the Business Owner to create Weigher and Laboratory Staff accounts.                                                                            High

  REQ-4.1-18     The system **SHALL** assign the appropriate system role to newly created Weigher and Laboratory Staff accounts.                                                           High

  REQ-4.1-19     The system **SHALL** allow authenticated users to update their email address, contact number, and address.                                                                Medium

  REQ-4.1-20     The system **SHALL NOT** allow users to modify their registered first name and last name after account creation.                                                          High

  REQ-4.1-21     The system **SHALL** allow authenticated users to change their account password.                                                                                          Medium

  REQ-4.1-22     The system **SHALL** provide a password recovery mechanism for registered users.                                                                                          Medium

  REQ-4.1-23     The system **SHALL** automatically terminate invalid or expired user sessions.                                                                                            High

  REQ-4.1-24     The system **SHALL** allow authenticated users to securely log out of the system.                                                                                         High
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.2 Price Negotiation and Contract Agreement Chat System

> **4.2.1 Description and Priority**
>
> The Price Negotiation and Contract Agreement Chat System enables approved Suppliers and the Business Owner to negotiate procurement terms, including price and quantity, through an integrated chat interface. The negotiation process allows both parties to exchange text messages, structured proposals, and counteroffers until an agreement is reached. Once both parties agree on the negotiated terms, the system automatically generates a procurement contract using the finalized negotiation details, which is then sent to the Supplier for review and electronic signature.
>
> **Priority:** High
>
> **4.2.2 Stimulus/Response Sequences**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                                                                  **System Response**
  --------------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------
  Supplier submits a negotiation proposal containing the proposed price per ton and quantity.   The system displays the proposal card in the integrated chat and notifies the Business Owner.

  Business Owner or Supplier opens an existing negotiation conversation.                        The system displays the conversation history, proposal cards, and negotiation status.

  Business Owner or Supplier sends a text message.                                              The system displays the message in the conversation and notifies the recipient.

  Business Owner accepts the Supplier's proposal.                                              The system records the agreed negotiation terms.

  Business Owner submits a counteroffer by modifying the proposed values.                       The system updates the proposal card with the revised values and notifies the Supplier.

  Business Owner rejects the Supplier's proposal.                                              The system marks the negotiation as rejected and ends the negotiation process.

  Supplier accepts the Business Owner's counteroffer.                                          The system records the finalized negotiation terms.

  Supplier submits a counteroffer by modifying the proposed values.                             The system updates the proposal card with the revised values and notifies the Business Owner.

  Supplier rejects the Business Owner's counteroffer.                                          The system marks the negotiation as rejected and ends the negotiation process.

  Business Owner generates and sends the contract.                                              The system automatically populates the contract using the finalized negotiation details and sends it to the Supplier.

  Supplier electronically signs the contract.                                                   The system validates the signature, activates the contract, and notifies the Business Owner that the contract has become active.
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.2.3 Functional Requirements**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**                                                                                                                                                              **Priority**
  ------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------
  REQ-4.2-1     The system **SHALL** provide an integrated chat interface for negotiation and contract agreement between the Business Owner and approved Suppliers.                                      High

  REQ-4.2-2     The system **SHALL** allow an approved Supplier to initiate a negotiation by submitting a structured proposal containing the proposed price per ton, and quantity.                       High

  REQ-4.2-3     The system **SHALL** display each negotiation proposal as a structured proposal card within the integrated chat interface.                                                               High

  REQ-4.2-4     The system **SHALL** notify the Business Owner when a new negotiation proposal is submitted.                                                                                             High

  REQ-4.2-5     The system **SHALL** allow the Business Owner to accept, reject, or submit a counteroffer for a negotiation proposal.                                                                    High

  REQ-4.2-6     The system **SHALL** allow the Business Owner to modify the proposed price per ton, quantity, and remarks when submitting a counteroffer.                                                High

  REQ-4.2-7     The system **SHALL** notify the Supplier when the Business Owner accepts, rejects, or submits a counteroffer.                                                                            High

  REQ-4.2-8     The system **SHALL** allow the Supplier to accept, reject, or submit a counteroffer in response to the Business Owner's counteroffer.                                                   High

  REQ-4.2-9     The system **SHALL** update the proposal card with the latest negotiated values whenever a counteroffer is submitted.                                                                    High

  REQ-4.2-10    The system **SHALL** record the finalized negotiation details after both parties agree on the proposed terms.                                                                            High

  REQ-4.2-11    The system **SHALL** **NOT** allow the Business Owner to generate a contract unless both parties have agreed on the negotiated terms.                                                    High

  REQ-4.2-12    The system **SHALL** automatically populate the contract with the finalized negotiation details, including the Supplier information, agreed price per ton, quantity, and total amount.   High

  REQ-4.2-13    The system **SHALL** allow the Business Owner to review and complete the remaining contract details before sending the contract to the Supplier.                                         High

  REQ-4.2-14    The system **SHALL** notify the Supplier when a contract has been sent by the Business Owner.                                                                                            High

  REQ-4.2-15    The system **SHALL** allow the Supplier to review the contract before signing.                                                                                                           High

  REQ-4.2-16    The system **SHALL** allow the Supplier to affix their previously uploaded electronic signature to the contract.                                                                         High

  REQ-4.2-17    The system **SHALL** mark the contract as Active and notify the Business Owner after the Supplier successfully signs the contract.                                                       High

  REQ-4.2-18    The system **SHALL** allow the Business Owner and the Supplier to exchange text messages within the integrated chat interface.                                                           Medium

  REQ-4.2-19    The system **SHALL** retain the negotiation conversation history until the negotiation is completed or terminated.                                                                       Medium

  REQ-4.2-20    The system **SHALL** display the current negotiation status (Pending, Accepted, or Rejected) within the negotiation interface.                                                           Medium

  REQ-4.2-21    The system **SHALL** notify the recipient whenever a new text message, proposal, or counteroffer is received.                                                                            Medium

  REQ-4.2-22    The system **SHALL** display the date and time for every text message, proposal, and counteroffer exchanged within the negotiation chat.                                                 Low
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.3 Contract Management

> **4.3.1 Description and Priority**
>
> The Contract Management feature enables the Business Owner and Supplier to monitor the progress of active contracts. Authorized Weighers and Laboratory Staff may access active contracts when recording deliveries and quality assessment results. The system tracks contract fulfillment based on recorded deliveries, automatically updates the remaining contractual quantity, determines the contract status, and monitors the delivery deadline. Contracts are automatically marked as Completed once the agreed contractual quantity has been fulfilled or Breached when the delivery deadline has elapsed before complete fulfillment.
>
> **Priority:** High
>
> **4.3.2 Stimulus/Response Sequences**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                                                     **System Response**
  -------------------------------------------------------------------------------- -------------------------------------------------------------------------------------------------------------------------
  Supplier views an active contract.                                               The system displays the contract details, delivery progress, remaining quantity, and current contract status.

  Weigher records a delivery under an active contract.                             The system updates the delivered quantity and recalculates the remaining contractual quantity.

  Laboratory Staff submits the quality assessment for the delivery.                The system associates the quality assessment with the corresponding delivery record.

  The agreed contractual quantity has been completely delivered.                   The system marks the contract as Completed.

  The delivery deadline is reached before the contractual quantity is fulfilled.   The system marks the contract as Breached.

  Business Owner views an active contract.                                         The system displays the contract details, delivery progress, remaining quantity, current status, and delivery deadline.

  An attempt is made to record a delivery for a Completed or Breached contract.    The system rejects the transaction and informs the user that deliveries can only be recorded for Active contracts.
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.3.3 Functional Requirements**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**                                                                                                                                        **Priority**
  ------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------ --------------
  REQ-4.3-1     The system **SHALL** allow authorized users to view active contract details.                                                                                       High

  REQ-4.3-2     The system **SHALL** display the contract status, agreed quantity, delivered quantity, remaining quantity, activation date, and delivery deadline.                 High

  REQ-4.3-3     The system **SHALL** automatically update the delivered quantity whenever a delivery is recorded.                                                                  High

  REQ-4.3-4     The system **SHALL** automatically calculate the remaining contractual quantity after each recorded delivery.                                                      High

  REQ-4.3-5     The system **SHALL** associate each recorded delivery with its corresponding active contract.                                                                      High

  REQ-4.3-6     The system **SHALL** allow the Supplier to monitor the fulfillment progress of their active contracts.                                                             Medium

  REQ-4.3-7     The system **SHALL** automatically mark a contract as Completed once the agreed contractual quantity has been fulfilled.                                           High

  REQ-4.3-8     The system **SHALL** automatically mark a contract as Breached when the delivery deadline has elapsed before the agreed contractual quantity has been fulfilled.   High

  REQ-4.3-9     The system **SHALL** prevent additional deliveries from being recorded once a contract has been marked as Completed or Breached.                                   High

  REQ-4.3-10    The system SHALL allow only Active contracts to accept delivery transactions.                                                                                      High

  REQ-4.3-11    The system SHALL display the percentage of contract fulfillment based on the delivered quantity relative to the agreed contractual quantity.                       High

  REQ-4.3-12    The system SHALL notify the Business Owner and Supplier whenever a contract is marked as Completed or Breached.                                                    Medium
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.4 Delivery and Inventory Management

> **4.4.1 Description and Priority**
>
> The Delivery and Inventory Management feature enables authorized personnel to record and monitor copra deliveries from both **contractual Suppliers** and **walk-in Suppliers**. Deliveries from contractual Suppliers are associated with active procurement contracts and automatically update the corresponding contract fulfillment progress and inventory records. Deliveries from walk-in Suppliers are recorded for documentation purposes, update the inventory records, and are identified as cash-paid transactions without being associated with a procurement contract.
>
> **Priority:** High
>
> **4.4.2 Stimulus/Response Sequences**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                                               **System Response**
  -------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  The Weigher records a delivery from a contractual Supplier.                The system records the delivery, associates it with the corresponding active contract, and updates the contract fulfillment progress and inventory records.

  The Weigher records a delivery from a walk-in Supplier.                    The system records the walk-in Supplier's name, address, and delivered weight, then updates the inventory records without affecting any procurement contract.

  Laboratory Staff submits the quality assessment for a recorded delivery.   The system associates the quality assessment results with the corresponding delivery record.

  The Business Owner views delivery records.                                 The system displays delivery information, quality assessment results, inventory records, and the associated contract information when applicable.

  Suppliers view their delivery information.                                 The system displays the delivery status and quantity delivered under the corresponding contract.
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.4.3 Functional Requirements**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**                                                                                                                                                                                                                                       **Priority**
  ------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------
  REQ-4.4-1     The system **SHALL** allow the Weigher to record deliveries from both contractual Suppliers and walk-in Suppliers.                                                                                                                                                High

  REQ-4.4-2     The system **SHALL** require the Weigher to select an active contract when recording a delivery from a contractual Supplier.                                                                                                                                      High

  REQ-4.4-3     The system **SHALL** require the Weigher to record the walk-in Supplier's name, address, delivery date, and delivered weight when recording a walk-in delivery.                                                                                                  High

  REQ-4.4-4     The system **SHALL** automatically associate deliveries from contractual Suppliers with their corresponding active procurement contracts.                                                                                                                         High

  REQ-4.4-5     The system **SHALL** allow the Laboratory Staff to submit the quality assessment results for each recorded delivery.                                                                                                                                              High

  REQ-4.4-6     The system **SHALL** automatically update all related records after a contractual Supplier's delivery has been successfully recorded, including the inventory quantity, delivered quantity, remaining contractual quantity, and contract fulfillment progress.   High

  REQ-4.4-7     The system **SHALL** automatically update the inventory quantity after a walk-in Supplier's delivery has been successfully recorded without affecting any procurement contract.                                                                                  High

  REQ-4.4-8     The system **SHALL** record walk-in Supplier deliveries independently of procurement contracts.                                                                                                                                                                   High

  REQ-4.4-9     The system **SHALL** exclude walk-in Supplier deliveries from contract fulfillment progress, Supplier performance ratings, and electronic payment disbursement processing.                                                                                        High

  REQ-4.4-10    The system **SHALL** allow the Business Owner to view delivery records from both contractual Suppliers and walk-in Suppliers.                                                                                                                                     High

  REQ-4.4-11    The system **SHALL** allow Suppliers to view only the delivery records associated with their own active procurement contracts.                                                                                                                                    Medium

  REQ-4.4-12    The system **SHALL** prevent deliveries from being recorded under procurement contracts that are marked as Completed, Breached, or Cancelled.                                                                                                                     High
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.5 Payment Management

> **4.5.1 Description and Priority**
>
> The Payment Management feature enables the Business Owner to review, compute, and process payments for deliveries made under active procurement contracts. The system calculates the payable amount based on the agreed contract price and validated delivery records, facilitates electronic payment disbursement through the integrated payment gateway, and generates electronic receipts for completed transactions. Walk-in Supplier transactions are excluded from this feature since they are settled through cash payments outside the system.
>
> **Priority:** High
>
> **4.5.2 Stimulus/Response Sequences**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                               **System Response**
  ---------------------------------------------------------- -------------------------------------------------------------------------------------------------------------------------------
  The Business Owner views deliveries awaiting payment.      The system displays each eligible delivery as a separate payment transaction with its corresponding payment details.

  The Business Owner selects a delivery for payment.         The system computes and displays the payable amount for the selected delivery.

  The Business Owner reviews and initiates the payment.      The system submits a separate payment request for the selected delivery to the integrated payment gateway.

  The payment gateway confirms a successful transaction.     The system updates the payment status of the corresponding delivery and generates an electronic receipt for that transaction.

  The payment gateway reports an unsuccessful transaction.   The system records the unsuccessful payment attempt and retains the delivery as unpaid.

  The Supplier views their payment records.                  The system displays each payment and electronic receipt according to its corresponding delivery.
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.5.3 Functional Requirements**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**                                                                                                                                               **Priority**
  ------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------
  REQ-4.5-1     The system **SHALL** allow the Business Owner to view contractual Supplier deliveries that are eligible for payment.                                                      High

  REQ-4.5-2     The system **SHALL** treat each validated delivery as a separate payment transaction.                                                                                     High

  REQ-4.5-3     The system **SHALL** automatically compute the payable amount for each individual delivery based on the applicable contract price and validated delivery information.     High

  REQ-4.5-4     The system **SHALL** allow the Business Owner to review the payment details of an individual delivery before initiating the payment.                                      High

  REQ-4.5-5     The system **SHALL** allow the Business Owner to initiate a separate electronic payment disbursement for each eligible delivery through the integrated payment gateway.   High

  REQ-4.5-6     The system **SHALL** prevent multiple successful payments from being processed for the same delivery.                                                                     High

  REQ-4.5-7     The system **SHALL** update the payment status of the corresponding delivery after receiving a response from the payment gateway.                                         High

  REQ-4.5-8     The system **SHALL** retain the unpaid status of a delivery when the payment transaction is unsuccessful.                                                                 High

  REQ-4.5-9     The system **SHALL** generate a separate electronic receipt for every successful delivery payment.                                                                        High

  REQ-4.5-10    The system **SHALL** associate each electronic receipt with its corresponding delivery and payment transaction.                                                           High

  REQ-4.5-11    The system **SHALL** allow contractual Suppliers to view the payment status and electronic receipt associated with each of their deliveries.                              Medium

  REQ-4.5-12    The system **SHALL** exclude walk-in Supplier deliveries from electronic payment disbursement processing.                                                                 High
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.6 Supplier Performance Rating

> **4.6.1 Description and Priority**
>
> The Supplier Performance Rating feature enables the system to evaluate the performance of contractual Suppliers based on predefined business criteria. The evaluation consists of Contract Fulfillment, Delivered Volume, and Copra Quality (Moisture Content), which contribute 60%, 20%, and 20%, respectively, to the Supplier's overall performance score. The system automatically computes the weighted score after a procurement contract has been completed or breached and converts the result into a Supplier rating ranging from 1 (lowest) to 5 (highest). Walk-in Suppliers are excluded from this evaluation because they do not participate in procurement contracts.
>
> **Priority:** Medium
>
> **4.6.2 Supplier Rating Criteria**
>
> **Contract Fulfillment**

  -------------------------------------------------------------------------------------------------
  **Contract Performance (60%)**                                **Score**
  ------------------------------------------------------------- -----------------------------------
  Contract fulfilled on or before the delivery deadline         100%

  Contract breached (not fulfilled before or on the deadline)   0%
  -------------------------------------------------------------------------------------------------

> **Delivered Volume**

  -----------------------------------------------------------------------
  **Delivered Volume (20%)**          **Score**
  ----------------------------------- -----------------------------------
  50 tons and above                   100%

  40 - 49.99 tons                     80%

  30 - 39.99 tons                     60%

  20 - 29.99 tons                     40%

  10 tons or below                    20%
  -----------------------------------------------------------------------

> **Copra Quality (Moisture Content)**

  -----------------------------------------------------------------------
  **Delivered Volume (20%)**          **Score**
  ----------------------------------- -----------------------------------
  6.5%--7.4%                          100%

  7.5%--8.4%                          80%

  8.5%--9.4%                          60%

  9.5%--10.4%                         40%

  10.5%--20.2%                        20%

  Greater than 20.2%                  Rejected (0%)
  -----------------------------------------------------------------------

> **4.6.3 Supplier Rating Computation**
>
> The system shall compute the Supplier's overall performance score using a weighted evaluation based on the three performance criteria.
>
> The weighted computation shall be performed using the following formula:
>
> $Overall\ Supplier\ Rating\  = \ $$\frac{\ Supplier\ Ratings}{Number\ of\ Related\ Contracts}$
>
> The computed overall performance score shall then be converted into a Supplier rating using the following scale.

  -----------------------------------------------------------------------
  Overall Performance Score           Supplier Rating
  ----------------------------------- -----------------------------------
  90%--100%                           5

  70%--89%                            4

  50%--69%                            3

  30%--49%                            2

  0%--29%                             1
  -----------------------------------------------------------------------

> **4.6.4 Stimulus/Response Sequences**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                              **System Response**
  --------------------------------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  A procurement contract is marked as **Completed**.        The system evaluates the Supplier using Contract Fulfillment, Delivered Volume, and Copra Quality, computes the Performance Score, generates the Supplier Rating, and updates the Overall Supplier Rating.

  A procurement contract is marked as **Breached**.         The system assigns a Contract Fulfillment score of 0%, computes the Performance Score, generates the Supplier Rating, and updates the Overall Supplier Rating.

  The Business Owner opens the Supplier Performance page.   The system displays the Supplier's Overall Supplier Rating and the ratings received for each completed or breached procurement contract.

  A Supplier views their profile.                           The system displays the Supplier's Overall Supplier Rating and individual Supplier Ratings for their completed or breached procurement contracts.
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.5.3 Functional Requirements**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**                                                                                                                                       **Priority**
  ------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------
  REQ-4.6-1     The system **SHALL** evaluate contractual Suppliers only after a procurement contract has been marked as Completed or Breached.                                   High

  REQ-4.6-2     The system **SHALL** evaluate Supplier performance using Contract Fulfillment, Delivered Volume, and Copra Quality.                                               High

  REQ-4.6-3     The system **SHALL** assign a Contract Fulfillment score based on the predefined Contract Fulfillment criteria.                                                   High

  REQ-4.6-4     The system **SHALL** determine the Delivered Volume score based on the predefined Delivered Volume criteria.                                                      High

  REQ-4.6-5     The system **SHALL** determine the Copra Quality score based on the predefined moisture content criteria.                                                         High

  REQ-4.6-6     The system **SHALL** compute the Performance Score using the weighted criteria of 60% Contract Fulfillment, 20% Delivered Volume, and 20% Copra Quality.          High

  REQ-4.6-7     The system **SHALL** convert the computed Performance Score into a Supplier Rating ranging from 1 to 5.                                                           High

  REQ-4.6-8     The system **SHALL** associate the generated Supplier Rating with the corresponding procurement contract.                                                         High

  REQ-4.6-9     The system **SHALL** calculate the Overall Supplier Rating by averaging all Supplier Ratings from the Supplier's completed and breached procurement contracts.   High

  REQ-4.6-10    The system **SHALL** automatically update the Overall Supplier Rating whenever a new Supplier Rating is generated.                                                High

  REQ-4.6-11    The system **SHALL** rank Suppliers according to their Overall Supplier Ratings.                                                                                  Medium

  REQ-4.6-12    The system **SHALL** allow the Business Owner to view each Supplier's Overall Supplier Rating and individual Supplier Ratings.                                   Medium

  REQ-4.6-13    The system **SHALL** allow Suppliers to view their own Overall Supplier Rating and individual Supplier Ratings.                                                   Medium

  REQ-4.6-14    The system **SHALL** exclude walk-in Suppliers from the Supplier Performance Rating feature.                                                                      High
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 4.7 Dashboard and Reporting

> **4.7.1 Description and Priority**
>
> The Dashboard and Reporting feature provides users with a centralized view of relevant system information based on their assigned roles. It presents transaction summaries, procurement activities, Supplier performance, and reports, while providing quick access to the Price Negotiation and Contract Agreement chat system through a chat icon.
>
> **Priority:** Medium
>
> **4.7.2 Dashboard Information**
>
> **Business Owner Dashboard**
>
> The Business Owner dashboard shall display:

-   Total Active Contracts

-   Total Completed Contracts

-   Total Breached Contracts

-   Total Suppliers

-   Total Deliveries

-   Total Inventory

-   Total Payments Disbursed

-   Top-Ranked Suppliers

-   Recent Activities

-   Notifications

-   Chat Ico​​n

**Supplier Dashboard**

The Supplier dashboard shall display:

-   Active Contracts

-   Contract Status

-   Delivery Progress

-   Payment History

-   Overall Supplier Rating

-   Recent Notifications

-   Chat Icon

**Weigher Dashboard**

The Weigher dashboard shall display:

-   Record Delivery

-   Delivery History

-   Pending Deliveries

> **Laboratory Staff Dashboard**

The Weigher dashboard shall display:

-   Search Delivery ID

-   Pending Quality Assessments

-   Assessment History

-   Notifications

**4.7.3 Reports**

> The system shall allow the Business Owner to generate and view the following reports:

-   Procurement Contract Report

-   Delivery Report

-   Inventory Report

-   Payment Report

-   Supplier Performance Report

> Report may be filtered by date range and exported for documentation purposes
>
> **4.7.4 Stimulus/Response Sequences**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Stimulus**                                                        **System Response**
  ------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------
  The Business Owner logs into the system.                            The system displays the Business Owner dashboard with procurement summaries, analytics, notifications, Supplier rankings, and the chat icon.

  A Supplier logs into the system.                                    The system computes and displays the payable amount for the selected delivery.

  The Business Owner requests a report.                               The system generates and displays the selected report.

  The Business Owner applies report filters.                          The system updates the report based on the selected filter options.

  The Business Owner exports a report.                                The system generates a downloadable copy of the selected report.

  The Business Owner clicks the chat icon.                            The system opens the Price Negotiation and Contract Agreement chat system associated with Section 4.2.

  A Supplier clicks the chat icon.                                    The system opens the Price Negotiation and Contract Agreement chat system associated with Section 4.2.

  A new negotiation message, proposal, or counteroffer is received.   The system displays an unread notification indicator on the chat icon.
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> **4.7.5 Functional Requirements**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**                                                                                                                                                        **Priority**
  ------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- --------------
  REQ-4.7-1     The system **SHALL** display a dashboard appropriate to the authenticated user's role.                                                                                            High

  REQ-4.7-2     The system **SHALL** display procurement summaries, notifications, and recent activities on the Business Owner dashboard.                                                          High

  REQ-4.7-3     The system **SHALL** display contract summaries, delivery progress, payment history, and Overall Supplier Rating on the Supplier dashboard.                                        High

  REQ-4.7-4     The system **SHALL** display Supplier rankings based on the Overall Supplier Ratings on the Business Owner dashboard.                                                              High

  REQ-4.7-5     The system **SHALL** allow the Business Owner to generate Procurement Contract, Delivery, Inventory, Payment, and Supplier Performance reports.                                    High

  REQ-4.7-6     The system **SHALL** allow reports to be filtered by date range.                                                                                                                   Medium

  REQ-4.7-7     The system **SHALL** allow the Business Owner to export generated reports in PDF and Microsoft Excel (.xlsx) formats.                                                              Medium

  REQ-4.7-8     The system **SHALL** display a chat icon on the dashboards of the Business Owner and Suppliers.                                                                                    Medium

  REQ-4.7-9     The system **SHALL** allow users except Laboratory Staff and Weigher to access the Price Negotiation and Contract Agreement chat system through the chat icon.                     Medium

  REQ-4.7-10    The system **SHALL** display an unread notification indicator on the chat icon when a new negotiation message, proposal, counteroffer, or contract-related message is received.    Medium

  REQ-4.7-11    The system **SHALL** display notifications for significant procurement events, including contract approvals, delivery updates, payment updates, and Supplier evaluation results.   Medium
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Other Nonfunctional Requirements

## 5.1 Performance Requirements

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**
  ------------- ----------------------------------------------------------------------------------------------------------------------------------------------------
  REQ-5.1-1     The system **SHALL** support at least **10 concurrent users** without significant degradation in performance.

  REQ-5.1-2     The system **SHALL** respond to user requests within **2 seconds** under normal operating conditions.

  REQ-5.1-3     The system **SHALL** generate procurement contracts within **5 seconds** after the Business Owner selects the **Send Contract** option.

  REQ-5.1-4     The system **SHALL** update contract fulfillment progress and inventory records immediately after a delivery transaction is successfully recorded.

  REQ-5.1-5     The system **SHALL** support continuous operation during normal business hours with minimal performance degradation.
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 5.2 Safety Requirements

  -------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**
  ------------- -----------------------------------------------------------------------------------------------------------------------
  REQ-5.2-1     The system **SHALL** perform automatic database backups at least once every **24 hours**.

  REQ-5.2-2     The system **SHALL** validate all required fields before saving procurement, delivery, payment, and contract records.

  REQ-5.2-3     The system **SHALL** prevent duplicate Supplier registrations using the same email address.

  REQ-5.2-4     The system **SHALL** prevent unauthorized modification of completed or breached contracts.

  REQ-5.2-5     The system **SHALL** preserve transaction records in the event of unexpected system interruptions.
  -------------------------------------------------------------------------------------------------------------------------------------

## 5.3 Security Requirements

  --------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**
  ------------- ------------------------------------------------------------------------------------------------------------------------
  REQ-5.3-1     The system **SHALL** authenticate users using registered email addresses and passwords.

  REQ-5.3-2     The system **SHALL** encrypt user passwords before storing them in the database.

  REQ-5.3-3     The system **SHALL** implement JSON Web Token (JWT) authentication for secure session management.

  REQ-5.3-4     The system **SHALL** enforce role-based access control for Business Owners, Suppliers, Weighers, and Laboratory Staff.

  REQ-5.3-5     The system **SHALL** transmit sensitive information over secure HTTPS connections.

  REQ-5.3-6     The system **SHALL** require Business Owner approval before newly registered Suppliers may access the system.

  REQ-5.3-7     The system **SHALL** securely store uploaded government-issued identification cards and electronic signatures.
  --------------------------------------------------------------------------------------------------------------------------------------

## 5.4 Software Quality Attributes

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**        **Requirement Description**
  ------------- -----------------------------------------------------------------------------------------------------------------------------------------------------------
  REQ-5.4-1     The system **SHALL** achieve at least **99% monthly availability**, excluding scheduled maintenance.

  REQ-5.4-2     The system **SHALL** maintain data consistency during contract, delivery, inventory, and payment transactions.

  REQ-5.4-3     The system **SHALL** provide a responsive and user-friendly web interface compatible with desktop and mobile devices.

  REQ-5.4-4     The system **SHALL** maintain a consistent interface across all modules.

  REQ-5.4-5     The system **SHALL** be developed using a modular architecture to facilitate future enhancements and maintenance.

  REQ-5.4-6     The system **SHALL** operate on modern web browsers, including Google Chrome, Microsoft Edge, Mozilla Firefox, and Safari.

  REQ-5.4-7     The system **SHALL** support future expansion to accommodate additional users and procurement transactions without requiring major architectural changes.
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## 5.5 Business Rules

> The system shall enforce the following business rules:

1.  Only approved Suppliers may participate in procurement negotiations.

2.  The Business Owner shall verify and approve Supplier registrations before Suppliers may access the system.

3.  Only the Business Owner may generate and send procurement contracts.

4.  A procurement contract shall only be generated after both parties agree on the negotiated procurement terms.

5.  The system shall automatically populate negotiated price and quantity into the generated contract.

6.  A contract shall become **Active** only after the Supplier digitally signs the contract.

7.  The system shall automatically set the contract delivery deadline to **one month and one day** from the contract activation date.

8.  Only active contracts may accept delivery transactions.

9.  A contract shall be automatically marked **Completed** when the agreed contractual quantity has been fully delivered.

10. A contract shall be automatically marked **Breached** when the delivery deadline has elapsed before the agreed contractual quantity has been fulfilled.

11. Payments shall be processed only for validated delivery transactions associated with active contracts.

12. Supplier performance ratings shall be calculated only after a contract has been completed or breached.

# Other Nonfunctional Requirements

##  **6.1 Legal and Regulatory Requirements**

-   The system **SHALL** comply with the Data Privacy Act of 2012 (Republic Act No. 10173) by protecting the confidentiality, integrity, and availability of personal information collected from users.

-   The system **SHALL** maintain secure handling of supplier identification documents and electronic signatures.

##  **6.2 Data Retention Requirements**

-   The system **SHALL** retain procurement contracts, delivery records, payment records, and supplier ratings unless removed by an authorized Business Owner in accordance with the organization's record retention policy.

-   The system **SHALL** preserve transaction records for audit and reporting purposes.

##  **6.3 Browser Compatibility**

> The system **SHALL** be compatible with the latest versions of the following web browsers:

-   Google Chrome

-   Microsoft Edge

-   Mozilla Firefox

-   Safari

## 6.4 Internet Connectivity

-   The system **SHALL** require a stable internet connection to perform authentication, procurement negotiation, contract management, delivery recording, payment processing, and notification services.

## 6.5 Third-Party Service Integration

> The system **SHALL** integrate with the following third-party services:

-   **Xendit** for payment disbursement processing.

-   **SMTP Email Service** for sending account verification, contract, and notification emails.

# Appendix A: Glossary 

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Term/Acronym**                     **Definition**
  ------------------------------------ -------------------------------------------------------------------------------------------------------------------------------------
  Business Owner                       The authorized user responsible for managing suppliers, procurement contracts, deliveries, payments, and overall system operations.

  Supplier                             An individual or organization that supplies copra to the Business Owner under an agreed procurement contract.

  Weigher                              Personnel responsible for recording the quantity of copra delivered by Suppliers.

  Laboratory Staff                     Personnel responsible for conducting quality assessments and recording laboratory results for delivered copra.

  Copra                                Dried coconut meat used as the primary raw material for coconut oil production.

  Procurement Contract                 A legally binding agreement between the Business Owner and the Supplier specifying the agreed procurement terms.

  Contract Breach                      A contract status indicating that the Supplier failed to fulfill the agreed contractual quantity before the delivery deadline.

  Contract Fulfillment                 The successful completion of the agreed delivery quantity within the specified contract period.

  Delivery Transaction                 A record of copra delivered under an active procurement contract.

  Inventory                            The total quantity of accepted copra recorded by the system after successful deliveries.

  Electronic Signature (E-Signature)   A digital representation of a Supplier's signature used to electronically sign procurement contracts.

  JWT (JSON Web Token)                 A token-based authentication mechanism used to verify user identity and maintain secure sessions.

  PCA                                  Philippine Coconut Authority, the government agency responsible for regulating and developing the Philippine coconut industry.

  SRS                                  Software Requirements Specification.

  MC                                   Moisture Content, the percentage of water present in a copra sample as determined during laboratory analysis.
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# 

#  

# Appendix B: Analysis Models 

> 

1.  **User Management**

```{=html}
<!-- -->
```
a.  ROLES

> **role_id :** INT (PK)
>
> **role_name :** VARCHAR(30)

b.  USERS

> **user_id :** INT (PK)
>
> **role_id :** INT (FK)
>
> **first_name :** VARCHAR (50)
>
> **last_name :** VARCHAR (50)
>
> **email :** VARCHAR (100)
>
> **phone :** VARCHAR (20)
>
> **address :** VARCHAR (255)
>
> **password_hash :** VARCHAR (255)
>
> **account_status :** ENUM ('Pending', 'Active', 'Rejected', 'Deleted')
>
> **created_at :** DATETIME
>
> **approved_by :** INT (FK)
>
> **approved_at :** DATETIME

c.  USER_VERIFY

> **verify_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **gov_id_file_id :** INT (FK)
>
> **esign_file_id :** INT (FK)
>
> **verify_status :** ENUM ('Pending', 'Approved', 'Rejected')
>
> **review_by :** INT (FK)
>
> **reviewed_at :** DATETIME

a.  LOGIN_HISTORY

**login_id :** INT (PK)

**user_id :** INT (PK)

**login_timestamp :** DATETIME

**ip_address :** VARCHAR (45)

**login_status :** ENUM ('Success', 'Failed')

b.  PASSWORD_RESET

> **reset_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **reset_token :** VARCHAR(255)
>
> **requested_at :** DATETIME
>
> **expires_at :** DATETIME
>
> **used_at :** DATETIME

c.  WALKIN_SUPPLIERS

> **walkin_supplier_id :** INT (PK)
>
> **first_name :** VARCHAR (50)
>
> **last_name :** VARCHAR (50)
>
> **address :** VARCHAR (255)
>
> **phone :** VARCHAR (20)
>
> **recorded_by :** INT (PK)
>
> **created_at :** DATETIME

d.  FILE_UPLOADS

**file_id :** INT (PK)

**uploaded_by :** INT (FK)

> **file_category :** ENUM ('Gov ID', 'Face ID', 'E-Sign', Contract Doc', 'Receipt','Bank QR', 'Other')
>
> **file_name :** VARCHAR (255)
>
> **file_url :** VARCHAR (500)
>
> **file_size :** INT
>
> **uploaded_at :** DATETIME

**2. Negotiation and Contract Creation**

a.  CONVERSATIONS

> **conversation_id :** INT (PK)
>
> **supplier_id :** INT (FK)
>
> **business_owner_id :** INT (FK)
>
> **contract_id :** INT (FK)
>
> **status :** ENUM ('Open', 'Closed')
>
> **created_at :** DATETIME

b.  MESSAGES

**message_id :** INT (PK)

**conversation_id :** INT (FK)

**sender_id :** INT (FK)

**message_type :** ENUM ('Text', 'Image', 'File', 'Contract Form')

**message_text :** TEXT

**sent_at :** DATETIME

c.  MESSAGE_ATTACHMENTS

> **attachment_id :** INT (PK)
>
> **message_id :** INT (FK)
>
> **file_id :** INT (FK)

d.  PROPOSAL_FORMS

> **proposal_id :** INT (PK)
>
> **conversation_id :** INT (FK)
>
> **supplier_id :** INT (FK)
>
> **proposed_price_per_kg :** DECIMAL
>
> **proposed_volume_tons :** DECIMAL
>
> **proposal_status :** ENUM ('Pending', 'Accepted', 'Rejected', 'Modified')
>
> **submitted_at :** DATETIME
>
> **reviewed_by :** INT (FK)
>
> **counter_price_per_kg :** DECIMAL
>
> **supersedes_proposal_id :** INT (FK)

e.  CONTRACTS

> **contract_id :** INT (PK)
>
> **contract_number :** VARCHAR (30)
>
> **supplier_id :** INT (FK)
>
> **business_owner_id :** INT (FK)
>
> **negotiated_price_per_kg :** DECIMAL
>
> **contracted_tons :** DECIMAL
>
> **signing_date :** DATE
>
> **due_date :** DATE
>
> **status :** ENUM ('Pending', 'Signed', 'Active', 'Completed', 'Breached')
>
> **created_at :** DATETIME

f.  CONTRACT_SIGNATURES

**signature_id :** INT (PK)

**contract_id :** INT (FK)

**signer_id :** INT (FK)

**signer_role :** ENUM ('Supplier', 'Business Owner')

> **esignature_file_id :** INT (FK)
>
> **signature_order :** INT
>
> **signed_at :** DATETIME

**3. Delivery and Quality Management**

a.  DELIVERIES

**delivery_id :** INT (PK)

**delivery_source :** ENUM ('Walkin', 'Contract-based')

**contract_id :** INT (FK)

**walkin_supplier_id :** INT (FK)

**batch_number :** VARCHAR (30)

> **delivery_date :** DATE
>
> **truck_plate_number :**VARCHAR (20)
>
> **weigher_id :** INT (FK)
>
> **lab_staff_id :** INT (FK)
>
> **delivery_status :** ENUM ('Pending', 'Weighed', 'Inspected', 'Accepted', 'Rejected')
>
> **payment_id :** INT (FK)
>
> **created_at :** DATETIME

b.  WEIGHING_RECORDS

> **weighing_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **weigher_id :** INT (FK)
>
> **gross_weight_kg :** DECIMAL
>
> **tare_weight_kg :** DECIMAL
>
> **net_weight_kg :** DECIMAL
>
> **weighed_at :** DATETIME

c.  LABORATORY_INSPECTIONS

> **inspection_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **lab_staff_id :** INT (FK)
>
> **moisture_content_pct :** DECIMAL
>
> **inspected_at :** DATETIME

d.  QUALITY_RESULTS

> **quality_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **inspection_id :** INT (FK)
>
> **result :** ENUM ('Accepted', 'Rejected')
>
> **ai_quality_result :** DECIMAL
>
> **remarks :** VARCHAR (255)
>
> **evaluated_at :** DATETIME

**4. Payment System**

a.  PCA_DISCOUNT_TABLE

**discount_id :** INT (PK)

> **moisture_content_pct :** DECIMAL
>
> **discount_value :** DECIMAL
>
> **table_version :** VARCHAR
>
> **effective_date :** DATE

b.  PAYMENTS

> **payment_id :** INT (PK)
>
> **supplier_id :** INT (FK)
>
> **business_owner_id :** INT (FK)
>
> **payment_date :** DATE
>
> **payment_week :** VARCHAR (20)
>
> **total_amount :** DECIMAL
>
> **payment_status :** ENUM ('Pending', 'Released', 'Failed')
>
> **reference_number :** VARCHAR (50)
>
> **payment_method :** ENUM ('Cash', 'Bank Transfer')
>
> **created_at :** DATETIME

c.  PAYMENT_DETAILS

> **payment_detail_id :** INT (PK)
>
> **payment_id :** INT (FK)
>
> **delivery_id :** INT (FK)
>
> **gross_weight_kg :** DECIMAL
>
> **tare_weight_kg :** DECIMAL
>
> **net_weight_kg :** DECIMAL
>
> **moisture_content_pct :** DECIMAL
>
> **moisture_deduction_kg :** DECIMAL
>
> **final_weight_kg :** DECIMAL
>
> **negotiated_price_per_kg :** DECIMAL
>
> **pca_discount_id :** INT (FK)
>
> **pca_discount_amount :** DECIMAL
>
> **line_amount :** DECIMAL

d.  E_RECEIPTS

> **receipt_id :** INT (PK)
>
> **payment_id :** INT (FK)
>
> **receipt_number :** VARCHAR (30)
>
> **file_id :** INT (FK)
>
> **generated_at :** DATETIME

**5. Inventory Management**

a.  INVENTORY

> **inventory_id :** INT (PK)
>
> **delivery_id :** INT (FK)
>
> **inventory_type :** ENUM ('Drying', 'Market-Ready')
>
> **current_weight_kg :** DECIMAL
>
> **warehouse_entry_date :** DATE
>
> **drying_start_date :** DATE
>
> **expected_ready_date :** DATE
>
> **market_ready_date :** DATE
>
> **quality_status :** ENUM ('Good', 'Degraded', 'Disposed').

b.  INVENTORY_TRANSACTIONS

**transaction_id :** INT (PK)

**inventory_id :** INT (FK).

> **transaction_type :** ENUM ('Stock In', 'Stock Out', 'Transfer', 'Drying to Market-Ready')
>
> **quantity_kg :** DECIMAL
>
> **transaction_date :** DATETIME
>
> **performed_by :** INT (FK)

c.  INVENTORY_ADJUSTMENTS

> **adjustment_id :** INT (PK)
>
> **inventory_id :** INT (FK)
>
> **adjusted_by :** INT (FK)
>
> **adjustment_reason :** VARCHAR (255)
>
> **old_weight_id :** DECIMAL
>
> **new_weight_id :** DECIMAL
>
> **adjusted_at :** DATETIME

**6. Dashboard, Analytics, and Notifications**

a.  SUPPLIER_PERFORMANCE_SNAPSHOT

> **snapshot_id :** INT (PK)
>
> **supplier_id :** INT (FK)
>
> **snapshot_date :** DATE
>
> **rejection_rate_pct :** DECIMAL
>
> **on_time_delivery_pct :** DECIMAL
>
> **contract_completion_rate_pct :** DECIMAL
>
> **avg_moisture_pct :** DECIMAL
>
> **payment_reliability_pct :** DECIMAL
>
> **overall_rank_score :** DECIMAL

b.  NOTIFICATIONS

> **notification_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **notification_type :** ENUM ('Contract Signed', 'Contract Activated', 'Delivery Accepted', 'Delivery Rejected', 'Weekly Payment Ready', 'Payment Released', 'Contract Completed', 'Contract Breached', 'Deadline Reminder', 'Other')
>
> **message :** VARCHAR (255)
>
> **related_entity_type :** VARCHAR (30)
>
> **related_entity_id :** INT
>
> **is_read :** BOOLEAN
>
> **created_at :** DATETIME

c.  AUDIT_LOGS

> **audit_id :** INT (PK)
>
> **user_id :** INT (FK)
>
> **action :** VARCHAR (100)
>
> **module :** VARCHAR (50)
>
> **timestamp :** DATETIME
>
> **ip_address :** VARCHAR (45)
>
> **authentication_method :** VARCHAR (50)
>
> **details :** TEXT

#  

# Appendix C: User Interface Mockups

**Login Page:**

**Registration Page:**

**Under Verification Page:**

**Setup Account Page:**

**Supplier Dashboard:**\

**Business Owner Dashboard:**

> 
>
> **User Management:**

**Negotiation Interface:**

> **Contract Preview:**
>
> 

**Delivery Recording (Supplier):**

**\
**

**Delivery Recording (Business Owner):**

**Copra Inventory Management (Business Owner)**

**Payment Management:**

**Supplier Rating:**

**Reports and Analytics:**

