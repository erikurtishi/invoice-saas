import type { ProfileLanguage } from '../profile.js';
import type { DocumentType } from './invoice-data.js';

/**
 * Printed invoice-content labels in the three markets' languages (spec §10 — the
 * *document* is localised to the tenant's invoice language, not just the app UI).
 * Deliberately separate from the app's react-i18next setup (X.1.1): these ship now
 * so a Macedonian invoice is never English-labelled, and they live with the
 * renderer that consumes them.
 *
 * SQ = Albanian, MK = Macedonian (Cyrillic).
 */

export interface RenderLabels {
  /** Document title, per type (spec §5). */
  documentTitle: Record<DocumentType, string>;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  validUntil: string;
  paidOn: string;
  paymentMethod: string;
  creditNoteFor: string;
  reference: string;
  billedTo: string;
  from: string;
  description: string;
  /** Placeholder shown in the line-item table while a draft has no rows yet
   * (X.7.7) — only reachable in the live preview; a saved invoice always has
   * at least one line. */
  lineItemsEmpty: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discount: string;
  amount: string;
  subtotal: string;
  tax: string;
  totalDiscount: string;
  total: string;
  amountDue: string;
  amountCredited: string;
  notes: string;
  bankDetails: string;
  bankName: string;
  accountName: string;
  iban: string;
  swift: string;
  accountNumber: string;
  signature: string;
  taxId: string;
  page: string;
}

const EN: RenderLabels = {
  documentTitle: {
    INVOICE: 'Invoice',
    PROFORMA: 'Proforma Invoice',
    QUOTE: 'Quote',
    CREDIT_NOTE: 'Credit Note',
    RECEIPT: 'Receipt',
  },
  invoiceNo: 'No.',
  issueDate: 'Issue date',
  dueDate: 'Due date',
  validUntil: 'Valid until',
  paidOn: 'Paid on',
  paymentMethod: 'Payment method',
  creditNoteFor: 'Credit note for',
  reference: 'Reference',
  billedTo: 'Billed to',
  from: 'From',
  description: 'Description',
  lineItemsEmpty: 'Add a line item to see it here',
  quantity: 'Qty',
  unitPrice: 'Unit price',
  taxRate: 'Tax',
  discount: 'Discount',
  amount: 'Amount',
  subtotal: 'Subtotal',
  tax: 'Tax',
  totalDiscount: 'Discount',
  total: 'Total',
  amountDue: 'Amount due',
  amountCredited: 'Amount credited',
  notes: 'Notes',
  bankDetails: 'Payment details',
  bankName: 'Bank',
  accountName: 'Account name',
  iban: 'IBAN',
  swift: 'SWIFT/BIC',
  accountNumber: 'Account no.',
  signature: 'Signature',
  taxId: 'Tax ID',
  page: 'Page',
};

const SQ: RenderLabels = {
  documentTitle: {
    INVOICE: 'Faturë',
    PROFORMA: 'Faturë Proforma',
    QUOTE: 'Ofertë',
    CREDIT_NOTE: 'Notë Krediti',
    RECEIPT: 'Dëftesë',
  },
  invoiceNo: 'Nr.',
  issueDate: 'Data e lëshimit',
  dueDate: 'Afati i pagesës',
  validUntil: 'E vlefshme deri',
  paidOn: 'Paguar më',
  paymentMethod: 'Mënyra e pagesës',
  creditNoteFor: 'Notë krediti për',
  reference: 'Referenca',
  billedTo: 'Faturuar për',
  from: 'Nga',
  description: 'Përshkrimi',
  lineItemsEmpty: 'Shtoni një artikull për ta parë këtu',
  quantity: 'Sasia',
  unitPrice: 'Çmimi për njësi',
  taxRate: 'TVSH',
  discount: 'Zbritje',
  amount: 'Vlera',
  subtotal: 'Nëntotali',
  tax: 'TVSH',
  totalDiscount: 'Zbritje',
  total: 'Totali',
  amountDue: 'Shuma për pagesë',
  amountCredited: 'Shuma e kredituar',
  notes: 'Shënime',
  bankDetails: 'Të dhënat e pagesës',
  bankName: 'Banka',
  accountName: 'Emri i llogarisë',
  iban: 'IBAN',
  swift: 'SWIFT/BIC',
  accountNumber: 'Nr. i llogarisë',
  signature: 'Nënshkrimi',
  taxId: 'NUI',
  page: 'Faqja',
};

const MK: RenderLabels = {
  documentTitle: {
    INVOICE: 'Фактура',
    PROFORMA: 'Профактура',
    QUOTE: 'Понуда',
    CREDIT_NOTE: 'Одобрение',
    RECEIPT: 'Признаница',
  },
  invoiceNo: 'Бр.',
  issueDate: 'Датум на издавање',
  dueDate: 'Рок на плаќање',
  validUntil: 'Важи до',
  paidOn: 'Платено на',
  paymentMethod: 'Начин на плаќање',
  creditNoteFor: 'Одобрение за',
  reference: 'Референца',
  billedTo: 'Фактурирано на',
  from: 'Од',
  description: 'Опис',
  lineItemsEmpty: 'Додајте ставка за да се прикаже тука',
  quantity: 'Кол.',
  unitPrice: 'Единечна цена',
  taxRate: 'ДДВ',
  discount: 'Попуст',
  amount: 'Износ',
  subtotal: 'Меѓузбир',
  tax: 'ДДВ',
  totalDiscount: 'Попуст',
  total: 'Вкупно',
  amountDue: 'Износ за плаќање',
  amountCredited: 'Одобрен износ',
  notes: 'Забелешки',
  bankDetails: 'Детали за плаќање',
  bankName: 'Банка',
  accountName: 'Име на сметка',
  iban: 'IBAN',
  swift: 'SWIFT/BIC',
  accountNumber: 'Бр. на сметка',
  signature: 'Потпис',
  taxId: 'ЕДБ',
  page: 'Страница',
};

const LABELS: Record<ProfileLanguage, RenderLabels> = { EN, SQ, MK };

export function renderLabels(language: ProfileLanguage): RenderLabels {
  return LABELS[language];
}
