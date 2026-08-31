/**
 * Privacy policy and Terms of Service copy (backlog X.4.1 / X.4.2).
 *
 * Deliberately kept OUT of `src/i18n` (react-i18next), same as the invoice
 * `render/labels.ts` — this is a long-form legal document, not UI chrome, and an
 * unreviewed machine translation of a privacy policy could misstate a reader's
 * rights. So the body is English-only for now; `<LegalPage>` shows a "translation
 * being prepared" notice when the app is set to another language. The page
 * chrome around it (title, dates, nav) still goes through `t()`.
 *
 * This is placeholder structure pending a legal review (decision D29): the bracketed
 * tokens — [COMPANY], [JURISDICTION], [CONTACT EMAIL], [EFFECTIVE DATE], [DPO
 * CONTACT] — are filled in at sign-off, along with the company's real legal entity
 * and address. The section structure (what's collected, why / legal basis,
 * retention, sharing, your rights, cookies, transfers, changes, contact) is the
 * deliverable; the exact wording is not final.
 */

export type LegalDocId = 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  /** One string per paragraph. A paragraph beginning with "- " renders as a bullet. */
  body: string[];
}

export interface LegalDocument {
  /** Placeholder — set to the real date the policy takes effect at legal sign-off. */
  effectiveDate: string;
  summary: string;
  sections: LegalSection[];
}

const COMPANY = '[COMPANY]';
const JURISDICTION = '[JURISDICTION]';
const CONTACT = '[CONTACT EMAIL]';
const EFFECTIVE_DATE = '[EFFECTIVE DATE]';

const privacy: LegalDocument = {
  effectiveDate: EFFECTIVE_DATE,
  summary:
    `This policy explains what personal data ${COMPANY} ("we") collects when you use the ` +
    'invoicing service, why we hold it, how long we keep it, who we share it with, and the ' +
    'rights you have over it. It covers both your own account data and the client details you ' +
    'enter to produce invoices.',
  sections: [
    {
      heading: 'Who we are',
      body: [
        `${COMPANY} operates this invoicing service. We are the data controller for your ` +
          `account data and a data processor for the client details you store. Our registered ` +
          `address and legal entity are set out at [COMPANY ADDRESS]. Questions about this ` +
          `policy go to ${CONTACT}.`,
      ],
    },
    {
      heading: 'What we collect',
      body: [
        '- Account data you give us: your email address, a password (stored only as a salted ' +
          'hash, never in the clear), and your business profile — business name, address, tax ' +
          'ID, logo, default currency and language.',
        '- Client and invoice data you enter: the names, addresses, email addresses and tax ' +
          'IDs of the clients you invoice, plus the line items, amounts and dates on each ' +
          'document. You control this content; we process it to render and send your invoices.',
        '- Billing data: if you subscribe to a paid plan, our payment processor (Stripe) ' +
          'handles your card details directly — we never see or store a full card number. We ' +
          'keep the subscription status, tier and renewal dates Stripe reports back.',
        '- Technical data: server logs (IP address, request time, user agent) kept for ' +
          'security and debugging, and a small number of strictly necessary cookies described ' +
          'in the Cookies section.',
        '- Optional AI drafting: if you use the AI invoice-draft feature, the text you submit ' +
          'is sent to our AI provider to extract invoice fields. We log the length of the ' +
          'request and the cost, not its content.',
      ],
    },
    {
      heading: 'Why we use it, and our legal basis',
      body: [
        '- To provide the service — create your account, store your profile, render and send ' +
          'invoices, generate PDFs. Legal basis: performance of our contract with you.',
        '- To take payment for paid plans. Legal basis: performance of a contract.',
        '- To keep the service secure and working — rate limiting, abuse prevention, ' +
          'diagnosing errors. Legal basis: our legitimate interest in a safe service.',
        '- To meet legal obligations, such as retaining records required by tax or accounting ' +
          'law. Legal basis: legal obligation.',
        '- We do not sell your data, and we do not use it for advertising.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Account and invoice data is kept for as long as your account is open. When you delete ' +
          'your account, the data it holds — profile, clients, products, templates, invoices, ' +
          'history and stored logo — is erased immediately (see "Your rights").',
        'Some records are kept longer where the law requires it: billing records and issued ' +
          'invoice metadata may be retained for the statutory period under applicable tax law ' +
          `in ${JURISDICTION}. Server logs are rotated on a rolling short-term basis. Our ` +
          'internal audit log of administrative actions is retained separately for security.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'We share data only with the processors that run the service, under contract and only ' +
          'as needed:',
        '- Our hosting provider, which runs the servers and database.',
        '- Stripe, for payment processing on paid plans.',
        '- Our email provider, to deliver account emails and the invoices you send.',
        '- Our AI provider, only for text you submit to the optional AI drafting feature.',
        'We disclose data to authorities only where we are legally compelled to.',
      ],
    },
    {
      heading: 'Where it is stored',
      body: [
        'Data is stored on servers in [HOSTING REGION]. Where a processor listed above ' +
          'transfers data outside your country, that transfer is covered by an appropriate ' +
          'safeguard such as Standard Contractual Clauses.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'You can access, correct, export or delete your data:',
        '- Access and correction: your business profile, clients, products and invoices are ' +
          'all editable in the app at any time.',
        '- Export: Settings → "Export my data" downloads a complete machine-readable copy of ' +
          'everything your account stores.',
        '- Deletion: Settings → "Delete account" permanently erases your account and all its ' +
          'data, and cancels any active subscription. This cannot be undone.',
        `- You may also contact us at ${CONTACT} to exercise any of these rights, and you have ` +
          'the right to complain to your local data protection authority.',
      ],
    },
    {
      heading: 'Cookies',
      body: [
        'We use a small number of strictly necessary cookies and similar storage: a session ' +
          'cookie to keep you signed in, and local storage for your language choice and your ' +
          'cookie preference itself. These are required for the app to work and are not used ' +
          'for tracking.',
        'Analytics or other non-essential cookies are only set if you opt in through the ' +
          'cookie banner, and you can change that choice at any time. We currently set no ' +
          'analytics cookies.',
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'If we make a material change we will update the effective date above and, where ' +
          'appropriate, notify you by email. Continued use of the service after a change means ' +
          'you accept the updated policy.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Data protection enquiries: ${CONTACT}. Postal address: [COMPANY ADDRESS].`],
    },
  ],
};

const terms: LegalDocument = {
  effectiveDate: EFFECTIVE_DATE,
  summary:
    `These terms govern your use of the invoicing service operated by ${COMPANY}. By creating ` +
    'an account you agree to them.',
  sections: [
    {
      heading: 'The service',
      body: [
        `${COMPANY} provides a hosted tool for creating, rendering, sending and managing ` +
          'invoices and related documents. We may add, change or remove features over time. We ' +
          'aim for high availability but do not guarantee the service will be uninterrupted or ' +
          'error-free.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'You must give accurate registration details and keep your password secure. You are ' +
          'responsible for activity under your account. You must be old enough to form a ' +
          `binding contract in ${JURISDICTION} and use the service for business purposes.`,
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        'You agree not to use the service to produce fraudulent or unlawful documents, to ' +
          'infringe others’ rights, to send unsolicited bulk email, to probe or disrupt the ' +
          'service or its security, or to resell the service without our agreement.',
        'You are responsible for the content of your invoices and for the lawful basis on ' +
          'which you hold your clients’ data.',
      ],
    },
    {
      heading: 'Plans, billing and cancellation',
      body: [
        'The service has a free tier and paid subscription plans. Paid plans are billed in ' +
          'advance on a recurring basis through our payment processor. Prices may change with ' +
          'notice; a change takes effect at your next renewal.',
        'You can cancel at any time from the billing portal; access continues until the end of ' +
          'the paid period. Deleting your account cancels any active subscription immediately. ' +
          'Except where the law requires otherwise, payments are non-refundable.',
      ],
    },
    {
      heading: 'Your content',
      body: [
        'You keep all rights in the data and documents you create. You grant us only the ' +
          'limited licence needed to host, process and display that content to operate the ' +
          'service for you.',
      ],
    },
    {
      heading: 'Availability and support',
      body: [
        'Support is provided on a reasonable-efforts basis through the channels listed in the ' +
          'app. We may carry out maintenance that briefly interrupts the service, and will ' +
          'give notice where practical.',
      ],
    },
    {
      heading: 'Liability',
      body: [
        'The service is provided "as is". To the extent permitted by law, we are not liable ' +
          'for indirect or consequential loss, or for lost profits, revenue or data. Nothing ' +
          'in these terms limits liability that cannot be limited by law. Our total liability ' +
          'is capped at the fees you paid us in the 12 months before the claim.',
        'You remain solely responsible for the correctness of the invoices you issue, ' +
          'including their tax treatment and totals.',
      ],
    },
    {
      heading: 'Suspension and termination',
      body: [
        'We may suspend or close an account that breaches these terms or the acceptable-use ' +
          'rules, or where required by law. You can close your account at any time from ' +
          'Settings.',
      ],
    },
    {
      heading: 'Governing law',
      body: [
        `These terms are governed by the law of ${JURISDICTION}, and disputes are subject to ` +
          'its courts, unless a mandatory consumer-protection rule provides otherwise.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'We may update these terms; we will change the effective date above and, for a ' +
          'material change, notify you by email. Continued use after a change means you accept ' +
          'the updated terms.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these terms: ${CONTACT}.`],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = { privacy, terms };
