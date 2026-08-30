import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { Button } from '../ui';

/** TODO(X.1.1): placeholder copy, see decision D9. */
const COPY = {
  cta: 'See plans',
} as const;

export interface UpgradeCalloutProps {
  title: string;
  description: ReactNode;
  /** `'banner'` (default) is a full-width inline strip above a form; `'card'` is a
   *  standalone block that replaces content the account can't reach. */
  variant?: 'banner' | 'card';
  /** Overrides the default "See plans" label. */
  ctaLabel?: string;
  className?: string;
}

/**
 * The one upgrade prompt at a plan-limit boundary (backlog 6.1.6 — "clear, not
 * obnoxious"). Always links to `/pricing`; checkout itself is Epic 6.2, so the
 * pricing page is where the flow currently ends.
 *
 * Server-side enforcement (6.1.4) is the real gate — this is only the affordance
 * that explains a 403 the user would otherwise hit blind.
 */
export function UpgradeCallout({
  title,
  description,
  variant = 'banner',
  ctaLabel = COPY.cta,
  className,
}: UpgradeCalloutProps) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4',
        variant === 'card' ? 'flex-col items-start sm:flex-row sm:items-center' : 'items-start',
        className,
      )}
      role="note"
    >
      <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/pricing">{ctaLabel}</Link>
      </Button>
    </div>
  );
}
