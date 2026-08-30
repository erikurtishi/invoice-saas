import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type ToastVariant = 'success' | 'error' | 'info' | 'loading';

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  loading: Loader2,
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
  loading: 'text-muted-foreground animate-spin',
};

export interface ToastProps {
  variant: ToastVariant;
  title: string;
  description?: string;
  onDismiss?: () => void;
  action?: ReactNode;
  className?: string;
}

/**
 * The visual card only (backlog 0.4.2). The queue, provider, auto-dismiss timers,
 * `aria-live` region and Motion-driven enter/exit stacking are task 0.4b.6 — this
 * component is what that system will render for each toast.
 */
export function Toast({ variant, title, description, onDismiss, action, className }: ToastProps) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      role="status"
      className={cn(
        'flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-popover p-4 shadow-md',
        className,
      )}
    >
      <Icon
        className={cn('mt-0.5 size-5 shrink-0', VARIANT_ICON_CLASS[variant])}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {action}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Dismiss</span>
        </button>
      )}
    </div>
  );
}
