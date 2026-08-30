import { Inbox, SearchX, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/button';

/**
 * Backlog 0.4b.3 — the one empty-state component, with two *documented, distinct*
 * variants. These are never interchangeable (five-states "Empty" rule):
 *
 * - `nothing-yet`  — a valid screen for a new account. Onboarding tone, a single
 *   primary CTA ("Create your first client"). Reach for this on first run.
 * - `nothing-found` — a search or filter matched zero rows. Neutral tone, and the
 *   recovery action is "Clear filters", not "create something".
 *
 * Per-surface copy lives at the call site (X.7.5 / X.7.6); this component only
 * fixes the layout, the default icon per variant, and the shape of the action.
 */

type EmptyStateVariant = 'nothing-yet' | 'nothing-found';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  clearFilters: 'Clear filters',
} as const;

const DEFAULT_ICON: Record<EmptyStateVariant, LucideIcon> = {
  'nothing-yet': Inbox,
  'nothing-found': SearchX,
};

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  /** Overrides the per-variant default. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /**
   * `nothing-yet`: the primary CTA node (usually a `<Button>`).
   * `nothing-found`: omit and pass `onClearFilters` instead for the standard action.
   */
  action?: ReactNode;
  /** `nothing-found` only — renders the standard "Clear filters" button. */
  onClearFilters?: () => void;
  className?: string;
}

export function EmptyState({
  variant = 'nothing-yet',
  icon,
  title,
  description,
  action,
  onClearFilters,
  className,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICON[variant];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          variant === 'nothing-yet'
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(action ?? onClearFilters) && (
        <div className="mt-2">
          {action ??
            (onClearFilters && (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                {COPY.clearFilters}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
