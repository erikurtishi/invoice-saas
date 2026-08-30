# Invoice Generator SaaS — Full Product Spec

## 1. What this is

A multi-tenant SaaS where a business owner signs up, sets up their profile once, and can
then generate polished, branded invoices for their own clients — fast, from scratch, from
a saved template, or (on Premium) by typing a plain-language description that AI turns into
a draft. No e-invoicing government integration, no payment-status tracking. This is a
document generation and history tool, not a compliance or accounts-receivable platform.

Target markets: North Macedonia, Albania, Kosovo primarily; US letter-format support for
international clients. UI in English, Albanian, Macedonian.

---

## 2. Core entities

- **Tenant** — one signed-up business/account
- **User** — the tenant owner (teammates/roles are a future extension, not MVP)
- **Client** — a tenant's customer: name, address, email, tax ID. Reusable across invoices.
- **Product** — a saved line item: name, default price, unit, tax rate. Reusable.
- **Template** — a saved design: block toggles, color, font, paper size. Reusable across invoices.
- **Invoice** — header (number, dates, type, template used, currency, paper size) + line items
- **InvoiceHistoryEvent** — append-only log per invoice: created / edited / downloaded / sent / duplicated
- **Subscription** — tier, status, source (Stripe or manual), start date, end date

---

## 3. Sign-up and setup

1. Sign up → creates a Tenant.
2. Business profile: name, logo, address, tax ID, default currency, default payment terms,
   default paper size, preferred language.
3. Free tier applied automatically (see §7).
4. Optional but recommended before first invoice: add Clients and Products — saved once,
   reused everywhere, biggest time-saver in the app.

---

## 4. Templates

Templates are a **design choice**, saved and reusable — not tied to any single invoice.

**Two ways to create one:**
- **Standalone**: Templates page → "New template" → design editor → save with a name →
  appears in the picker for future invoices.
- **Inline while creating an invoice**: "Start from scratch" → design live as part of
  building that invoice → on save, both the new invoice *and* the new reusable template
  are saved together, in one motion.

**Editor controls (everything toggleable):**
- Logo position, accent color, font pairing (curated pairs only — not a free font picker,
  for consistent quality; must include a pairing with full Cyrillic + Latin coverage, e.g.
  Noto Sans / Noto Serif, so Macedonian invoices never silently break)
- Show/hide: tax column, discount column, unit price vs. line-total-only, notes section,
  bank/payment details block, signature line, footer/thank-you message
- Paper size: A4, US Letter, Legal, A5 — sets page dimensions, margins auto-adjust
- Block order (drag to rearrange header / client info / line items / totals / notes)

**Live preview**: an accurate, pixel-matched on-screen mockup (real fonts, true page
proportions) updates instantly as toggles change. A real PDF file is only generated on
Download/Send — regenerating an actual PDF on every keystroke would be too slow — but the
live preview is built from the exact same render logic so what's shown matches the output
exactly.

---

## 5. Document types

One rendering engine, one `invoice_type` field that swaps a few fields/labels — not separate
templates per type:

| Type | Distinct behavior |
|---|---|
| Invoice | Standard numbering, due date, "Amount Due" |
| Proforma | Labeled "Proforma," does not consume the real invoice number sequence |
| Quote / Estimate | No due date; "Valid until" instead of "Amount Due" |
| Credit note | Reference field pointing to the original invoice number; amounts shown as credit |
| Receipt | "Paid on [date]" + payment method, no due date |

---

## 6. Creating and using an invoice

1. Pick client (or add inline) → pick document type → pick a saved template *or* build one
   from scratch inline → add line items (from Product library or typed fresh) → paper size
   defaults from template, overridable.
2. **Preview screen** — exactly two actions:
   - **Download** — generates the PDF from current data, done.
   - **Send** — emails the PDF to the client's saved email, done.
   - If the client has no email on file: Send is disabled (greyed out, tooltip prompts to
     add one); Download always works regardless.
3. No status tracking, no paid/unpaid state, no reminders, no dashboard of "outstanding
   amounts." That is explicitly out of scope.
4. The invoice is saved to the **Invoice Library** either way (whether downloaded or sent).

### Editing after send or download

- Any saved invoice can be reopened and edited freely — line items, template, totals,
  anything.
- **Download / Send from an edit screen** always uses the current, edited data — regenerated
  fresh each time, never a frozen snapshot.
- **Save** is a separate, explicit action — only persists the edit if clicked.
- **Cancel** discards the edit and reverts to the last saved version; nothing is written.
- Net effect: a user can freely "preview a what-if" edit (download/send it) without
  committing the change to the record, and only Save makes it permanent.

### Duplicate

"Duplicate this invoice" copies everything — client, line items, template, document type,
paper size — into a brand-new invoice with a new ID and a blank history. Fully editable
before its own download/send.

---

## 7. History (per invoice, and dashboard-wide)

Every invoice keeps an append-only event log:
- Created (timestamp)
- Edited (timestamp)
- Downloaded (timestamp, count)
- Sent (timestamp, recipient email)
- Duplicated from / duplicated into (linked)

The main dashboard is a searchable, filterable view over the Invoice Library plus this
history trail — filter by client, date, type, action. This is the "real business tool"
layer, distinct from any payment-status tracking (which is intentionally not included).

---

## 8. AI feature (Premium only)

- One entry point: a text box above the invoice form.
- Example input: *"Web design for Acme, 3 pages, €150 each, due in 15 days."*
- AI returns structured, editable draft data: matched or new client, line items
  (description/qty/unit price), computed due date — populated into the normal invoice
  form. Nothing is sent or saved automatically.
- User reviews/edits like any manual invoice, then goes through the same
  Preview → Download/Send flow.
- Guardrails: AI never computes totals or tax (your code always does that
  deterministically); if uncertain about a field, it leaves it blank rather than guessing.
- Rate-limited per plan (e.g. 30–50 generations/month on Premium) to keep AI API cost
  predictable.

---

## 9. Subscription tiers

| Tier | Price | Invoices | Templates | AI |
|---|---|---|---|---|
| Free | €0 | **1 invoice, lifetime, per account** (not monthly) | Default template only | None |
| Basic | €10/mo | Unlimited | Unlimited, full editor | None |
| Premium | €30/mo | Unlimited | Unlimited, full editor | Yes, rate-limited/month |

Billing via Stripe for card subscriptions. Usage counters (invoices this month/lifetime,
AI generations this month) enforced server-side, not just in the UI.

### Manual / cash-paid access (admin-granted)

For customers who pay in cash or outside Stripe:
- Admin opens the tenant in the Admin Center and grants a tier (Basic or Premium) with an
  explicit **start date** and **end date** — e.g. tenant pays €20 cash → admin grants
  Basic for 2 months starting today.
- This is stored as a subscription record with `source: manual`, alongside the
  Stripe-driven ones, and checked by the exact same permission logic — the app doesn't
  care whether access came from Stripe or a manual grant.
- When the end date passes, access automatically reverts to Free — no manual step needed
  to revoke it.
- Admin can extend, shorten, or cancel a manual grant at any time.

---

## 10. Localization

- UI languages: English, Albanian, Macedonian (Cyrillic).
- Font requirement: full Latin Extended + Cyrillic glyph coverage across every template —
  Noto Sans (sans) and Noto Serif (serif) as the safe base pairing, since many attractive
  Google Fonts silently lack Cyrillic support.
- Invoice **content** labels (Total, Due date, Amount Due, etc.) are translated per the
  tenant's chosen invoice language — not just the app UI — so a Macedonian client receives
  a properly localized document, not an English-labeled one from a Macedonian-market
  product.

---

## 11. Privacy & cookies

Given client PII (names, addresses, tax IDs) is stored across three countries:
- A privacy policy covering what's collected and why.
- A cookie consent banner distinguishing essential vs. analytics cookies.
- A data-deletion path for a tenant closing their account.
- This isn't full regulatory compliance work, but is cheap now and expensive to retrofit —
  built in at MVP stage.

---

## 12. Admin Center (internal, admin-role only)

**Overview dashboard**
- MRR, active subscriptions by tier, churn this month, new signups this week
- Free → paid conversion rate

**Users / tenants**
- Searchable list: signup date, tier, invoices created, last active
- View-only access to a tenant's usage for support purposes
- Manual actions: **grant/extend/revoke a manual subscription with start/end dates**
  (cash-payment flow, §9), disable an account

**Usage & cost monitoring**
- AI generations consumed vs. plan limits (main variable cost to watch)
- Email send volume, if the provider bills per send
- Storage usage (PDFs, logos)

**Billing view**
- Stripe subscriptions, failed payments, upcoming renewals, refund requests
- Manual (cash) grants listed alongside Stripe ones, clearly labeled by source

**Support**
- Simple inbox/ticket view tied to a tenant for context

---

## 13. Stack (fits Hostinger hosting)

- **Frontend**: React + TypeScript, Tailwind CSS
- **Backend**: Node.js (Express or NestJS)
- **Database**: MySQL if on Hostinger shared hosting; Postgres if on a Hostinger VPS
  (VPS gives more freedom — recommended if budget allows)
- **PDF rendering**: Puppeteer (headless Chrome) or a lightweight HTML-to-PDF library,
  server-side, using the same render logic as the live preview so output always matches
  what was shown
- **Email sending**: transactional email provider (Resend, Postmark, or SMTP via Hostinger)
  for the Send action
- **Billing**: Stripe for card subscriptions, manual records for cash grants
- **AI**: LLM API call for the drafting feature only, isolated from all calculation logic

---

## 14. Explicitly out of scope (for now)

- Government e-invoicing / fiscalization integration (Albania CIS, North Macedonia
  e-Faktura, Kosovo EFS) — noted as a possible future phase, not part of this build
- Payment status tracking (paid/unpaid/overdue)
- Recurring/scheduled invoice automation
- Team roles/multi-user per tenant
- Real tax determination engine (manual tax rate entry only)
