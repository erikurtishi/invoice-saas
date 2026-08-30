import { z } from 'zod';

import { PAPER_SIZES } from '../profile.js';
import { FONT_PAIRINGS } from './fonts.js';

/**
 * Template config schema (backlog 3.1.1). A template is a *design* — block order,
 * visibility toggles, accent colour, font pairing, paper size, logo placement —
 * saved once and reused across invoices (spec §4). Stored as JSON (Postgres
 * `jsonb`, decision D2), Zod-validated on the way in and out.
 *
 * **Versioned from day one.** `schemaVersion` is a literal; when the shape changes,
 * bump `TEMPLATE_SCHEMA_VERSION`, keep the old parser, and migrate saved configs
 * forward (3.3 territory). Never read a stored config without parsing it through
 * `templateConfigSchema` first.
 */

export const TEMPLATE_SCHEMA_VERSION = 1 as const;

/** Every content block the renderer knows how to draw (backlog 3.1.3). `blockOrder`
 * is a permutation of exactly this list; `header` first / `footer` last is the
 * default but not enforced — the editor (3.2.4) decides what is draggable. */
export const TEMPLATE_BLOCKS = [
  'header',
  'businessInfo',
  'clientInfo',
  'invoiceMeta',
  'lineItems',
  'totals',
  'notes',
  'bankDetails',
  'signature',
  'footer',
] as const;
export type TemplateBlock = (typeof TEMPLATE_BLOCKS)[number];

export const DEFAULT_BLOCK_ORDER: readonly TemplateBlock[] = TEMPLATE_BLOCKS;

/** Toggles that hide parts of the layout (spec §4 "show/hide"). Structural blocks
 * (header, the two party blocks, meta, line items, totals) are always drawn; these
 * are the genuinely optional pieces plus the line-item columns. */
export const templateVisibilitySchema = z.object({
  /** Line-item table: show the unit-price column, or line totals only. */
  unitPrice: z.boolean().default(true),
  /** Line-item table: show the per-line tax column. */
  taxColumn: z.boolean().default(true),
  /** Line-item table: show the per-line discount column. */
  discountColumn: z.boolean().default(false),
  notes: z.boolean().default(true),
  bankDetails: z.boolean().default(true),
  signature: z.boolean().default(false),
  footer: z.boolean().default(true),
});
export type TemplateVisibility = z.infer<typeof templateVisibilitySchema>;

export const DEFAULT_VISIBILITY: TemplateVisibility = {
  unitPrice: true,
  taxColumn: true,
  discountColumn: false,
  notes: true,
  bankDetails: true,
  signature: false,
  footer: true,
};

export const LOGO_POSITIONS = ['left', 'center', 'right'] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export const LOGO_SIZES = ['sm', 'md', 'lg'] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

/** Height the logo renders at, in px, per size step. */
export const LOGO_SIZE_PX: Record<LogoSize, number> = { sm: 40, md: 60, lg: 88 };

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1e293b.')
  .transform((value) => value.toLowerCase());

/** Constrained accent palette for the picker (backlog 3.2.5). A custom hex is also
 * allowed by the schema — this is just the curated set the UI offers first. */
export const TEMPLATE_ACCENT_PRESETS = [
  '#1e293b', // slate
  '#1d4ed8', // blue
  '#0f766e', // teal
  '#b91c1c', // red
  '#7c3aed', // violet
  '#b45309', // amber
  '#15803d', // green
  '#be185d', // pink
] as const;

const blockOrderSchema = z
  .array(z.enum(TEMPLATE_BLOCKS))
  .refine(
    (order) =>
      order.length === TEMPLATE_BLOCKS.length && new Set(order).size === TEMPLATE_BLOCKS.length,
    'blockOrder must list every block exactly once.',
  )
  .default([...DEFAULT_BLOCK_ORDER]);

export const templateLogoSchema = z.object({
  position: z.enum(LOGO_POSITIONS).default('left'),
  size: z.enum(LOGO_SIZES).default('md'),
});
export type TemplateLogo = z.infer<typeof templateLogoSchema>;

export const DEFAULT_LOGO: TemplateLogo = { position: 'left', size: 'md' };

export const templateConfigSchema = z.object({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION).default(TEMPLATE_SCHEMA_VERSION),
  blockOrder: blockOrderSchema,
  visibility: templateVisibilitySchema.default(DEFAULT_VISIBILITY),
  accentColor: hexColor.default('#1e293b'),
  fontPairing: z.enum(FONT_PAIRINGS).default('noto-sans'),
  paperSize: z.enum(PAPER_SIZES).default('A4'),
  logo: templateLogoSchema.default(DEFAULT_LOGO),
});
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/** A fully-defaulted config — the starting point for a brand-new template and the
 * fallback when a caller has none yet. */
export function defaultTemplateConfig(): TemplateConfig {
  return templateConfigSchema.parse({});
}
