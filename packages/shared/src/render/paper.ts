import { PAPER_SIZES, type PaperSize } from '../profile.js';

/**
 * Paper geometry for the renderer (backlog 3.1.4). One source for the page
 * dimensions, the CSS `@page size` keyword, and the margin — used by both the
 * screen preview (a `.page` box at these mm dimensions) and the print/PDF path
 * (`@page { size; margin }`). Margins "auto-adjust" per size (spec §4): A5 gets a
 * tighter margin so the smaller page keeps a usable content column.
 */

export { PAPER_SIZES };
export type { PaperSize };

export interface PaperGeometry {
  /** `@page { size: <cssSize> }` keyword. */
  cssSize: string;
  /** Page box, millimetres. Portrait. */
  widthMm: number;
  heightMm: number;
  /** Uniform page margin, millimetres. */
  marginMm: number;
}

export const PAPER_GEOMETRY: Record<PaperSize, PaperGeometry> = {
  A4: { cssSize: 'A4', widthMm: 210, heightMm: 297, marginMm: 18 },
  LETTER: { cssSize: 'Letter', widthMm: 215.9, heightMm: 279.4, marginMm: 18 },
  LEGAL: { cssSize: 'Legal', widthMm: 215.9, heightMm: 355.6, marginMm: 18 },
  A5: { cssSize: 'A5', widthMm: 148, heightMm: 210, marginMm: 12 },
};

export function paperGeometry(size: PaperSize): PaperGeometry {
  return PAPER_GEOMETRY[size];
}
