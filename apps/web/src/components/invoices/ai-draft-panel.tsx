import {
  AI_DRAFT_EXAMPLE_PROMPTS,
  type AiDraftResponse,
  type Entitlements,
} from '@invoice-saas/shared';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiStatus, useDraftInvoice } from '../../features/ai/use-ai';
import { useFormatters } from '../../i18n/format';
import { toUserMessage } from '../../lib/error-message';
import { getTransition, useReducedMotion } from '../../lib/motion-presets';
import { UpgradeCallout } from '../billing/upgrade-callout';
import { Button, Textarea } from '../ui';

export interface AiDraftPanelProps {
  /** `entitlements.canUseAi` — false for Free/Basic, who get the upgrade prompt. */
  canUseAi: boolean;
  /** `entitlements.ai` — the monthly allowance, for the remaining counter (7.2.4). */
  ai: Entitlements['ai'] | undefined;
  /** Hand the validated draft to the form, which maps it into field state (7.2.2).
   *  Never persists — the user still goes through Save. */
  onApply: (result: AiDraftResponse) => void;
}

/**
 * The one AI entry point (spec §8, backlog 7.2.1): a prompt box above the invoice
 * form. Premium-gated (others see an upgrade prompt), Motion-animated loading
 * with a Cancel (7.2.2 / X.7.4), a remaining-generations counter (7.2.4) and
 * teaching examples (7.2.5). The server re-checks Premium + the monthly cap on
 * every call (7.1.6); this is only the affordance.
 */
export function AiDraftPanel({ canUseAi, ai, onApply }: AiDraftPanelProps) {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const reduce = useReducedMotion();
  const status = useAiStatus();
  const mutation = useDraftInvoice();
  const abortRef = useRef<AbortController | null>(null);

  const [prompt, setPrompt] = useState('');
  const [latestAi, setLatestAi] = useState<AiDraftResponse['ai'] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);

  if (!canUseAi) {
    return (
      <UpgradeCallout
        variant="card"
        title={t('invoices.aiGateTitle')}
        description={t('invoices.aiGateBody')}
      />
    );
  }

  const serverEnabled = status.data?.enabled ?? true;
  const usage: {
    limit: number | null;
    remaining: number | null;
    periodResetsAt: string | null;
  } | null = latestAi ?? ai ?? null;
  const canSubmit = serverEnabled && prompt.trim().length > 0 && !mutation.isPending;

  const err = mutation.error;
  const isAbort = err instanceof Error && err.name === 'AbortError';
  const showError = mutation.isError && !isAbort;

  const handleDraft = () => {
    if (!canSubmit) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setApplied(false);
    setWarnings([]);
    mutation.mutate(
      { prompt: prompt.trim(), signal: controller.signal },
      {
        onSuccess: (result) => {
          setLatestAi(result.ai);
          setWarnings(result.warnings);
          setApplied(true);
          onApply(result);
        },
      },
    );
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    mutation.reset();
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t('invoices.aiHeading')}</p>
          <p className="text-xs text-muted-foreground">{t('invoices.aiSub')}</p>
        </div>
      </div>

      <div className="mt-3">
        <AnimatePresence mode="wait" initial={false}>
          {mutation.isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={getTransition({ duration: 0.15 })}
              className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-4"
              role="status"
              aria-live="polite"
            >
              <motion.span
                aria-hidden
                {...(reduce
                  ? {}
                  : {
                      animate: { opacity: [1, 0.35, 1] },
                      transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
                    })}
              >
                <Sparkles className="size-5 text-primary" />
              </motion.span>
              <span className="flex-1 text-sm text-foreground">{t('invoices.aiDrafting')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                <X className="size-4" aria-hidden />
                {t('common.cancel')}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={getTransition({ duration: 0.15 })}
              className="flex flex-col gap-2"
            >
              <Textarea
                rows={2}
                value={prompt}
                disabled={!serverEnabled}
                placeholder={AI_DRAFT_EXAMPLE_PROMPTS[0]}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleDraft();
                  }
                }}
                aria-label={t('invoices.aiHeading')}
              />

              {serverEnabled ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-muted-foreground">
                    {t('invoices.aiExamplesLabel')}
                  </span>
                  {AI_DRAFT_EXAMPLE_PROMPTS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setPrompt(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('invoices.aiUnavailable')}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {usage && usage.limit !== null ? (
                    <>
                      {t('invoices.aiCounter', {
                        remaining: usage.remaining ?? 0,
                        limit: usage.limit,
                      })}
                      {usage.periodResetsAt
                        ? ` · ${t('invoices.aiResets', { date: formatDate(usage.periodResetsAt) })}`
                        : ''}
                    </>
                  ) : null}
                </p>
                <Button type="button" size="sm" onClick={handleDraft} disabled={!canSubmit}>
                  <Sparkles className="size-4" aria-hidden />
                  {t('invoices.aiDraft')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showError && (
        <p
          className="mt-2 flex items-start gap-1.5 text-xs font-medium text-destructive"
          role="alert"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {toUserMessage(mutation.error)}
        </p>
      )}

      {applied && !mutation.isPending && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-xs font-medium text-primary">{t('invoices.aiApplied')}</p>
          {warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
