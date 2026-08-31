import { describe, expect, it } from 'vitest';

import {
  amountStringToMinor,
  bpToPercentString,
  MINOR_UNITS_PER_MAJOR,
  minorToAmountString,
  percentStringToBp,
} from './money.js';

/**
 * Money conversion unit tests (backlog X.5.1). This module is the *only* boundary
 * between the human decimal strings a form collects and the integer minor units /
 * basis points everything else runs on (decision D17), so its round-trips and its
 * rejection of malformed input are exactly the "bugs here cost real money" surface.
 */

describe('minorToAmountString', () => {
  it('always renders two fractional digits', () => {
    expect(minorToAmountString(0)).toBe('0.00');
    expect(minorToAmountString(5)).toBe('0.05');
    expect(minorToAmountString(50)).toBe('0.50');
    expect(minorToAmountString(1050)).toBe('10.50');
    expect(minorToAmountString(100000)).toBe('1000.00');
  });

  it('keeps the sign on negatives (credit-note lines, refunds)', () => {
    expect(minorToAmountString(-1)).toBe('-0.01');
    expect(minorToAmountString(-1234)).toBe('-12.34');
  });

  it('truncates a non-integer minor value rather than rounding it', () => {
    expect(minorToAmountString(1234.9)).toBe('12.34');
  });
});

describe('amountStringToMinor', () => {
  it('parses plain decimals', () => {
    expect(amountStringToMinor('0')).toBe(0);
    expect(amountStringToMinor('10')).toBe(1000);
    expect(amountStringToMinor('10.5')).toBe(1050);
    expect(amountStringToMinor('10.50')).toBe(1050);
    expect(amountStringToMinor('1234.05')).toBe(123405);
  });

  it('parses negatives', () => {
    expect(amountStringToMinor('-0.01')).toBe(-1);
    expect(amountStringToMinor('-12.34')).toBe(-1234);
  });

  it('trims surrounding whitespace', () => {
    expect(amountStringToMinor('  12.34  ')).toBe(1234);
  });

  it('returns null for empty or malformed input', () => {
    for (const bad of ['', '   ', 'abc', '12.', '.5', '12.345', '1,234.00', '1e3', '+5', '--1']) {
      expect(amountStringToMinor(bad), bad).toBeNull();
    }
  });

  it('round-trips with minorToAmountString', () => {
    for (const minor of [0, 1, 99, 100, 2500, 123405, -1, -1234]) {
      expect(amountStringToMinor(minorToAmountString(minor))).toBe(minor);
    }
  });
});

describe('bpToPercentString', () => {
  it('trims trailing zeros', () => {
    expect(bpToPercentString(0)).toBe('0');
    expect(bpToPercentString(1800)).toBe('18');
    expect(bpToPercentString(1850)).toBe('18.5');
    expect(bpToPercentString(825)).toBe('8.25');
    expect(bpToPercentString(500)).toBe('5');
  });
});

describe('percentStringToBp', () => {
  it('parses percentages to basis points', () => {
    expect(percentStringToBp('0')).toBe(0);
    expect(percentStringToBp('18')).toBe(1800);
    expect(percentStringToBp('8.25')).toBe(825);
    expect(percentStringToBp('18.5')).toBe(1850);
  });

  it('returns null for empty, negative or over-precise input', () => {
    for (const bad of ['', ' ', '-5', '5.123', 'x', '5%']) {
      expect(percentStringToBp(bad), bad).toBeNull();
    }
  });

  it('round-trips with bpToPercentString for representable rates', () => {
    for (const bp of [0, 500, 825, 1800, 1850, 2000]) {
      expect(percentStringToBp(bpToPercentString(bp))).toBe(bp);
    }
  });
});

describe('MINOR_UNITS_PER_MAJOR', () => {
  it('is 100 — every target currency is 2-decimal', () => {
    expect(MINOR_UNITS_PER_MAJOR).toBe(100);
  });
});
