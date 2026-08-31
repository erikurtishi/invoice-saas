import { type TemplateBlock, type TemplateVisibility } from '@invoice-saas/shared';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';

const BLOCK_LABEL_KEY = {
  header: 'template.blockHeader',
  businessInfo: 'template.blockBusinessInfo',
  clientInfo: 'template.blockClientInfo',
  invoiceMeta: 'template.blockInvoiceMeta',
  lineItems: 'template.blockLineItems',
  totals: 'template.blockTotals',
  notes: 'template.blockNotes',
  bankDetails: 'template.blockBankDetails',
  signature: 'template.blockSignature',
  footer: 'template.blockFooter',
} as const satisfies Record<TemplateBlock, string>;

/** Blocks whose visibility is a toggle (the rest are always drawn). */
const VISIBILITY_BY_BLOCK: Partial<Record<TemplateBlock, keyof TemplateVisibility>> = {
  notes: 'notes',
  bankDetails: 'bankDetails',
  signature: 'signature',
  footer: 'footer',
};

export interface BlockOrderControlProps {
  order: readonly TemplateBlock[];
  visibility: TemplateVisibility;
  onChange: (order: TemplateBlock[]) => void;
}

/**
 * Drag-and-drop block reordering (backlog 3.2.4) via Motion's `Reorder` — its
 * layout animations give the smooth swap, and honour `prefers-reduced-motion`
 * through the app-wide `MotionConfig`. Every row also has up/down buttons so
 * reordering works without a pointer drag (keyboard / reduced-motion path, X.3.2).
 */
export function BlockOrderControl({ order, visibility, onChange }: BlockOrderControlProps) {
  const { t } = useTranslation();

  const move = (block: TemplateBlock, delta: number) => {
    const from = order.indexOf(block);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, block);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('template.blockOrderTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('template.blockOrderHint')}</p>
      </div>

      <Reorder.Group
        axis="y"
        values={[...order]}
        onReorder={onChange}
        className="flex flex-col gap-1"
      >
        {order.map((block, index) => {
          const visKey = VISIBILITY_BY_BLOCK[block];
          const hidden = visKey ? !visibility[visKey] : false;
          return (
            <BlockRow
              key={block}
              block={block}
              hidden={hidden}
              isFirst={index === 0}
              isLast={index === order.length - 1}
              onMoveUp={() => move(block, -1)}
              onMoveDown={() => move(block, 1)}
              t={t}
            />
          );
        })}
      </Reorder.Group>
    </div>
  );
}

interface BlockRowProps {
  block: TemplateBlock;
  hidden: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  t: TFunction;
}

function BlockRow({ block, hidden, isFirst, isLast, onMoveUp, onMoveDown, t }: BlockRowProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm',
        hidden && 'opacity-60',
      )}
    >
      <button
        type="button"
        aria-label={t('template.drag')}
        onPointerDown={(e) => dragControls.start(e)}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="flex-1 truncate text-foreground">{t(BLOCK_LABEL_KEY[block])}</span>

      {hidden && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('template.hidden')}
        </span>
      )}

      <div className="flex">
        <button
          type="button"
          aria-label={t('template.moveUp')}
          disabled={isFirst}
          onClick={onMoveUp}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t('template.moveDown')}
          disabled={isLast}
          onClick={onMoveDown}
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronDown className="size-4" aria-hidden />
        </button>
      </div>
    </Reorder.Item>
  );
}
