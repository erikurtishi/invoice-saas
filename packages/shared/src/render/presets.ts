import {
  DEFAULT_BLOCK_ORDER,
  type TemplateBlock,
  type TemplateConfig,
  templateConfigSchema,
} from './template-config.js';

/**
 * Curated base templates (backlog 3.1.7 — "ship 4–6 as starting presets"). Each is
 * a full, valid `TemplateConfig`; a new tenant gets these in the picker and the
 * editor (3.2) opens one as a starting point. Free tier is limited to the first
 * one (`classic`) as the default (spec §9, backlog 3.3.6).
 *
 * `id` is stable — templates saved from a preset don't reference it, they copy the
 * config, so renaming a preset later is safe.
 */

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  config: TemplateConfig;
}

function preset(
  overrides: Partial<{
    blockOrder: TemplateBlock[];
    visibility: Partial<TemplateConfig['visibility']>;
    accentColor: string;
    fontPairing: TemplateConfig['fontPairing'];
    paperSize: TemplateConfig['paperSize'];
    logo: Partial<TemplateConfig['logo']>;
  }>,
): TemplateConfig {
  return templateConfigSchema.parse({
    blockOrder: overrides.blockOrder ?? [...DEFAULT_BLOCK_ORDER],
    visibility: overrides.visibility ?? {},
    accentColor: overrides.accentColor,
    fontPairing: overrides.fontPairing,
    paperSize: overrides.paperSize,
    logo: overrides.logo ?? {},
  });
}

export const TEMPLATE_PRESETS: readonly TemplatePreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean sans-serif, left logo, everything on. The free-tier default.',
    config: preset({
      accentColor: '#1e293b',
      fontPairing: 'noto-sans',
      logo: { position: 'left' },
    }),
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Blue accent, no discount column — for straightforward service invoices.',
    config: preset({
      accentColor: '#1d4ed8',
      fontPairing: 'noto-sans',
      visibility: { discountColumn: false, signature: false },
    }),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Centred logo, muted accent, no bank block or signature — just the essentials.',
    config: preset({
      accentColor: '#475569',
      fontPairing: 'noto-sans',
      logo: { position: 'center', size: 'sm' },
      visibility: { bankDetails: false, signature: false, footer: true },
    }),
  },
  {
    id: 'formal',
    name: 'Formal',
    description: 'Serif headings, right-aligned logo, signature line — reads like a contract.',
    config: preset({
      accentColor: '#14532d',
      fontPairing: 'noto-serif-headings',
      logo: { position: 'right' },
      visibility: { signature: true },
    }),
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Small logo, discount column on, tuned for long line-item lists.',
    config: preset({
      accentColor: '#b45309',
      fontPairing: 'noto-sans',
      logo: { size: 'sm' },
      visibility: { discountColumn: true, unitPrice: true },
    }),
  },
  {
    id: 'statement',
    name: 'Statement',
    description: 'Full serif, burgundy accent, A4 — a heavier, editorial look.',
    config: preset({
      accentColor: '#9f1239',
      fontPairing: 'noto-serif',
      visibility: { signature: true },
    }),
  },
];

export function templatePresetById(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.id === id);
}

/** The preset a new tenant / the free tier starts on (spec §9). */
export const DEFAULT_TEMPLATE_PRESET_ID = 'classic';
