import type { ProfileLanguage } from '../profile.js';
import type { DocumentType, InvoiceRenderData } from './invoice-data.js';
import { computeInvoiceTotals, type RawLineItem } from './invoice-math.js';

/**
 * A realistic sample invoice for previews, the presets gallery, the dev preview
 * route and the 3.1.6 font check. Content is provided in all three invoice
 * languages so "Macedonian renders correctly in every template" (3.1.6) can be
 * verified against real Cyrillic, and Albanian diacritics (ë, ç) against SQ.
 */

interface SampleContent {
  business: { name: string; address: string[]; taxId: string };
  client: { name: string; address: string[]; taxId: string; email: string };
  lines: Array<Pick<RawLineItem, 'description' | 'unit'>>;
  notes: string;
  footer: string;
}

const CONTENT: Record<ProfileLanguage, SampleContent> = {
  EN: {
    business: {
      name: 'Northlight Studio',
      address: ['12 Maker Street', 'Skopje 1000'],
      taxId: 'MK4030999123456',
    },
    client: {
      name: 'Acme Trading LLC',
      address: ['Rr. Dëshmorët e Kombit 5', 'Tirana 1001'],
      taxId: 'AL K12345678L',
      email: 'billing@acme.example',
    },
    lines: [
      { description: 'Brand identity design', unit: 'project' },
      { description: 'Website UI design', unit: 'page' },
      { description: 'Consulting', unit: 'hour' },
    ],
    notes: 'Payment within 14 days of the issue date. Thank you for your business.',
    footer: 'Northlight Studio · hello@northlight.example · northlight.example',
  },
  SQ: {
    business: {
      name: 'Studio Northlight',
      address: ['Rr. Maker 12', 'Shkup 1000'],
      taxId: 'MK4030999123456',
    },
    client: {
      name: 'Acme Trading SH.P.K.',
      address: ['Rr. Dëshmorët e Kombit 5', 'Tiranë 1001'],
      taxId: 'AL K12345678L',
      email: 'billing@acme.example',
    },
    lines: [
      { description: 'Dizajn i identitetit të markës', unit: 'projekt' },
      { description: 'Dizajn i ndërfaqes së faqes', unit: 'faqe' },
      { description: 'Konsulencë', unit: 'orë' },
    ],
    notes: 'Pagesa brenda 14 ditëve nga data e lëshimit. Faleminderit për bashkëpunimin.',
    footer: 'Studio Northlight · hello@northlight.example · northlight.example',
  },
  MK: {
    business: {
      name: 'Студио Нортлајт',
      address: ['ул. Мејкер 12', 'Скопје 1000'],
      taxId: 'MK4030999123456',
    },
    client: {
      name: 'Акме Трговија ДООЕЛ',
      address: ['ул. Партизанска 8', 'Скопје 1000'],
      taxId: 'MK4080012345678',
      email: 'smetki@akme.example',
    },
    lines: [
      { description: 'Дизајн на бренд идентитет', unit: 'проект' },
      { description: 'Дизајн на кориснички интерфејс', unit: 'страница' },
      { description: 'Консултации', unit: 'час' },
    ],
    notes: 'Плаќање во рок од 14 дена од датумот на издавање. Ви благодариме на соработката.',
    footer: 'Студио Нортлајт · hello@northlight.example · northlight.example',
  },
};

const LINE_NUMBERS: Array<{
  quantityMilli: number;
  unitPriceMinor: number;
  taxRateBp: number;
  discountBp: number;
}> = [
  { quantityMilli: 1000, unitPriceMinor: 120000, taxRateBp: 1800, discountBp: 0 },
  { quantityMilli: 6000, unitPriceMinor: 8000, taxRateBp: 1800, discountBp: 1000 },
  { quantityMilli: 4500, unitPriceMinor: 6000, taxRateBp: 500, discountBp: 0 },
];

export interface SampleInvoiceOptions {
  language?: ProfileLanguage;
  documentType?: DocumentType;
  currency?: string;
}

export function sampleInvoiceData(options: SampleInvoiceOptions = {}): InvoiceRenderData {
  const language = options.language ?? 'EN';
  const documentType = options.documentType ?? 'INVOICE';
  const content = CONTENT[language];

  const rawLines: RawLineItem[] = content.lines.map((line, index) => ({
    description: line.description,
    unit: line.unit ?? null,
    quantityMilli: LINE_NUMBERS[index]!.quantityMilli,
    unitPriceMinor: LINE_NUMBERS[index]!.unitPriceMinor,
    taxRateBp: LINE_NUMBERS[index]!.taxRateBp,
    discountBp: LINE_NUMBERS[index]!.discountBp,
  }));

  const { lineItems, totals } = computeInvoiceTotals(rawLines, { documentType });

  return {
    documentType,
    language,
    currency: options.currency ?? 'EUR',
    number: 'INV-2026-0042',
    issueDate: '2026-08-30',
    dueDate: documentType === 'RECEIPT' || documentType === 'CREDIT_NOTE' ? null : '2026-09-13',
    paidDate: documentType === 'RECEIPT' ? '2026-08-30' : null,
    paymentMethod: documentType === 'RECEIPT' ? 'Bank transfer' : null,
    creditNoteRef: documentType === 'CREDIT_NOTE' ? 'INV-2026-0031' : null,
    reference: 'PO-8841',
    business: {
      name: content.business.name,
      addressLines: content.business.address,
      email: 'hello@northlight.example',
      phone: '+389 2 000 000',
      taxId: content.business.taxId,
    },
    businessLogoUrl: null,
    client: {
      name: content.client.name,
      addressLines: content.client.address,
      email: content.client.email,
      phone: null,
      taxId: content.client.taxId,
    },
    lineItems,
    totals,
    notes: content.notes,
    bankDetails: {
      bankName: 'Komercijalna Banka AD Skopje',
      accountName: content.business.name,
      iban: 'MK07 2000 0000 0012 345',
      swift: 'KOBSMK2X',
      accountNumber: null,
    },
    footerText: content.footer,
    signatureLabel: null,
  };
}
