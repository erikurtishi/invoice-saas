import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * A form-wide status line — distinct from the per-field errors `<FormField>`
 * renders (backlog X.7.9 success feedback / X.7.12 error). `error` for a request
 * failure with no single field to blame; `success` for an inline "saved"
 * confirmation on a form that stays on screen after submit.
 */
export function FormBanner({
  variant,
  children,
  className,
}: {
  variant: 'error' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const Icon = variant === 'error' ? TriangleAlert : CheckCircle2;
  return (
    <p
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
        variant === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-success/30 bg-success/10 text-success',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
