import { motion } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/cn';
import {
  getTransition,
  listContainerVariants,
  listItemTransition,
  listItemVariants,
} from '../../lib/motion-presets';

export interface RecordCardField {
  label: string;
  value: ReactNode;
}

/**
 * The `<ul>` a stack of `<RecordCard>`s lives in — carries the shared list-stagger
 * container variants (X.3.1) so the cards animate in on mount and collapse under
 * `prefers-reduced-motion` via the app-wide `MotionConfig`.
 */
export function RecordCardList({ className, ...props }: ComponentProps<typeof motion.ul>) {
  return (
    <motion.ul
      className={className}
      variants={listContainerVariants}
      initial="initial"
      animate="animate"
      {...props}
    />
  );
}

/**
 * The small-screen stand-in for a table row (X.2.4): list surfaces render their
 * `<Table>` at `md` and up and a stack of these below it. `title` is the primary
 * cell — usually the link/button that opens the record; `fields` are the
 * remaining columns as label/value pairs; `actions` is the same row menu the
 * table uses. Render inside a `<RecordCardList>`.
 */
export function RecordCard({
  title,
  fields,
  actions,
  className,
}: {
  title: ReactNode;
  fields: RecordCardField[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <motion.li
      className={cn('flex flex-col gap-3 rounded-lg border border-border bg-card p-4', className)}
      variants={listItemVariants}
      transition={getTransition(listItemTransition)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</div>
        {actions}
      </div>
      {fields.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="truncate text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </motion.li>
  );
}
