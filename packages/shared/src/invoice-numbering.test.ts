import { describe, expect, it } from 'vitest';

import { DEFAULT_NUMBER_FORMATS, formatInvoiceNumber } from './invoice.js';
import { DOCUMENT_TYPES } from './render/invoice-data.js';

/**
 * `formatInvoiceNumber` unit tests (backlog X.5.1). The atomic *allocation* of the
 * next sequence integer is a DB transaction, covered by
 * `apps/api/src/services/invoice-numbering.integration.test.ts`; this covers the
 * pure render of that integer into the display number — the part the web app also
 * runs to preview the next number.
 */

describe('formatInvoiceNumber', () => {
  it('fills the standard tokens', () => {
    expect(formatInvoiceNumber('INV-{YYYY}-{seq}', { seq: 7, year: 2026, seqPadding: 4 })).toBe(
      'INV-2026-0007',
    );
  });

  it('pads {seq} to the configured width and does not truncate a longer number', () => {
    expect(formatInvoiceNumber('{seq}', { seq: 5, year: 2026, seqPadding: 1 })).toBe('5');
    expect(formatInvoiceNumber('{seq}', { seq: 12345, year: 2026, seqPadding: 4 })).toBe('12345');
  });

  it('supports the two-digit year token', () => {
    expect(formatInvoiceNumber('{YY}-{seq}', { seq: 1, year: 2026, seqPadding: 3 })).toBe('26-001');
  });

  it('resolves the legacy {prefix} alias to empty', () => {
    expect(formatInvoiceNumber('{prefix}INV-{seq}', { seq: 1, year: 2026, seqPadding: 2 })).toBe(
      'INV-01',
    );
  });

  it('truncates a non-integer sequence before padding', () => {
    expect(formatInvoiceNumber('{seq}', { seq: 7.9, year: 2026, seqPadding: 3 })).toBe('007');
  });

  it('renders every default format to a plausible number', () => {
    for (const dt of DOCUMENT_TYPES) {
      const out = formatInvoiceNumber(DEFAULT_NUMBER_FORMATS[dt], {
        seq: 42,
        year: 2026,
        seqPadding: 4,
      });
      expect(out).toMatch(/^[A-Z]+-2026-0042$/);
    }
  });
});
