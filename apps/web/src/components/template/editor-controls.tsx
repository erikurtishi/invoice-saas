import {
  FONT_PAIRING_LABELS,
  FONT_PAIRINGS,
  LOGO_POSITIONS,
  LOGO_SIZES,
  type LogoPosition,
  type LogoSize,
  PAPER_SIZES,
  type PaperSize,
  TEMPLATE_ACCENT_PRESETS,
  type TemplateConfig,
  type TemplateVisibility,
} from '@invoice-saas/shared';
import type { TFunction } from 'i18next';
import { AlignCenter, AlignLeft, AlignRight, Check } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import { Input, Select, Switch } from '../ui';
import { BlockOrderControl } from './block-order-control';

const VIS_LABEL_KEY = {
  unitPrice: 'template.visUnitPrice',
  taxColumn: 'template.visTaxColumn',
  discountColumn: 'template.visDiscountColumn',
  notes: 'template.visNotes',
  bankDetails: 'template.visBankDetails',
  signature: 'template.visSignature',
  footer: 'template.visFooter',
} as const satisfies Record<keyof TemplateVisibility, string>;

function paperLabel(size: PaperSize, t: TFunction): string {
  if (size === 'LETTER') return t('profile.paperLetter');
  if (size === 'LEGAL') return t('profile.paperLegal');
  return size;
}

const LOGO_SIZE_LABEL_KEY = {
  sm: 'template.logoSizeSm',
  md: 'template.logoSizeMd',
  lg: 'template.logoSizeLg',
} as const satisfies Record<LogoSize, string>;
const LOGO_POSITION_ICON: Record<LogoPosition, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface EditorControlsProps {
  config: TemplateConfig;
  onChange: (config: TemplateConfig) => void;
}

/**
 * The template editor's controls panel (backlog 3.2.3 / 3.2.5 / 3.2.6 / 3.2.7 plus
 * paper size). Pure presentational: it takes a `TemplateConfig` and emits a new
 * one on every change — the parent owns the state and feeds the preview.
 */
export function EditorControls({ config, onChange }: EditorControlsProps) {
  const { t } = useTranslation();
  const set = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) =>
    onChange({ ...config, [key]: value });
  const setVisibility = (key: keyof TemplateVisibility, value: boolean) =>
    onChange({ ...config, visibility: { ...config.visibility, [key]: value } });
  const setLogo = (patch: Partial<TemplateConfig['logo']>) =>
    onChange({ ...config, logo: { ...config.logo, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('template.layout')}>
        <Field label={t('template.paperSize')}>
          <Select
            aria-label={t('template.paperSize')}
            options={PAPER_SIZES.map((s) => ({ value: s, label: paperLabel(s, t) }))}
            value={config.paperSize}
            onValueChange={(v) => set('paperSize', v as PaperSize)}
          />
        </Field>

        <Field label={t('template.fontPairing')}>
          <div className="flex flex-col gap-1">
            {FONT_PAIRINGS.map((pairing) => (
              <RadioRow
                key={pairing}
                label={FONT_PAIRING_LABELS[pairing]}
                selected={config.fontPairing === pairing}
                onSelect={() => set('fontPairing', pairing)}
              />
            ))}
          </div>
        </Field>
      </Section>

      <Section title={t('template.accent')}>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_ACCENT_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              aria-pressed={config.accentColor.toLowerCase() === hex}
              onClick={() => set('accentColor', hex)}
              className={cn(
                'size-7 rounded-full border ring-offset-2 ring-offset-background transition',
                config.accentColor.toLowerCase() === hex
                  ? 'ring-2 ring-ring'
                  : 'border-border hover:scale-105',
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t('template.accentCustom')}
            value={config.accentColor}
            onChange={(e) => set('accentColor', e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
          />
          <Input
            aria-label={t('template.accentCustom')}
            value={config.accentColor}
            spellCheck={false}
            onChange={(e) => {
              const next = e.target.value;
              if (HEX_RE.test(next)) set('accentColor', next.toLowerCase());
            }}
            className="w-28 font-mono text-xs"
          />
        </div>
      </Section>

      <Section title={t('template.logo')}>
        <Field label={t('template.logoPosition')}>
          <Segmented
            options={LOGO_POSITIONS.map((p) => ({
              value: p,
              label: p,
              icon: LOGO_POSITION_ICON[p],
            }))}
            value={config.logo.position}
            onSelect={(v) => setLogo({ position: v as LogoPosition })}
          />
        </Field>
        <Field label={t('template.logoSize')}>
          <Segmented
            options={LOGO_SIZES.map((s) => ({ value: s, label: t(LOGO_SIZE_LABEL_KEY[s]) }))}
            value={config.logo.size}
            onSelect={(v) => setLogo({ size: v as LogoSize })}
          />
        </Field>
      </Section>

      <Section title={t('template.columns')}>
        <ToggleRow
          label={t('template.visUnitPrice')}
          checked={config.visibility.unitPrice}
          onChange={(v) => setVisibility('unitPrice', v)}
        />
        <ToggleRow
          label={t('template.visTaxColumn')}
          checked={config.visibility.taxColumn}
          onChange={(v) => setVisibility('taxColumn', v)}
        />
        <ToggleRow
          label={t('template.visDiscountColumn')}
          checked={config.visibility.discountColumn}
          onChange={(v) => setVisibility('discountColumn', v)}
        />
      </Section>

      <Section title={t('template.sections')}>
        {(['notes', 'bankDetails', 'signature', 'footer'] as const).map((key) => (
          <ToggleRow
            key={key}
            label={t(VIS_LABEL_KEY[key])}
            checked={config.visibility[key]}
            onChange={(v) => setVisibility(key, v)}
          />
        ))}
      </Section>

      <Section title="">
        <BlockOrderControl
          order={config.blockOrder}
          visibility={config.visibility}
          onChange={(order) => set('blockOrder', order)}
        />
      </Section>
    </div>
  );
}

// --- small building blocks ---------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function RadioRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
        selected ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground',
        )}
      >
        {selected && <Check className="size-3" aria-hidden />}
      </span>
      {label}
    </button>
  );
}

interface SegmentedOption {
  value: string;
  label: string;
  icon?: typeof AlignLeft;
}

function Segmented({
  options,
  value,
  onSelect,
}: {
  options: SegmentedOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
