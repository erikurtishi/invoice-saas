import { Sparkles } from 'lucide-react';

import { cn } from '../../lib/cn';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = { label: 'AI', title: 'Filled by AI — check this before saving' } as const;

/**
 * The marker on a field an AI draft populated (backlog 7.2.3 — "visual indication
 * of AI-filled fields so the user knows what to verify"). Cleared by the form
 * once the user edits that field. Feed it into `<FormField badge={…}>`.
 */
export function AiFilledBadge({ className }: { className?: string }) {
  return (
    <span
      title={COPY.title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary',
        className,
      )}
    >
      <Sparkles className="size-2.5" aria-hidden />
      {COPY.label}
    </span>
  );
}
