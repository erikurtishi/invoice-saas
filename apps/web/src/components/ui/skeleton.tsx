import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

/**
 * Generic pulsing placeholder box. This is the primitive; the shape-matched
 * components that actually stand in for real content (SkeletonTable, SkeletonCard,
 * SkeletonForm, SkeletonInvoicePreview) are task 0.4b.2, built out of this.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
