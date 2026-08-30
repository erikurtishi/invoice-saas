import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import { toUserMessage } from '../../lib/error-message';
import { getTransition, toastTransition, toastVariants } from '../../lib/motion-presets';
import {
  ToastContext,
  type ToastApi,
  type ToastInput,
  type ToastRecord,
  type PromiseMessages,
} from '../../hooks/use-toast';
import { Toast, type ToastVariant } from '../ui/toast';

/**
 * Backlog 0.4b.6 — the toast system: queued, dismissible, auto-timed, Motion
 * enter/exit, and announced to assistive tech via a polite `aria-live` region.
 * `loading` toasts stay until `update`/`dismiss` (that's the loading→resolved
 * transition — same toast id, variant flips). Mount once, near the app root.
 */

const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 4;

function normalize(input: ToastInput | string): ToastInput {
  return typeof input === 'string' ? { title: input } : input;
}

let counter = 0;
const nextId = () => `toast-${Date.now()}-${counter++}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const arm = useCallback(
    (id: string, duration: number | null) => {
      clearTimer(id);
      if (duration === null) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [clearTimer, dismiss],
  );

  const upsert = useCallback(
    (id: string, variant: ToastVariant, input: ToastInput) => {
      const duration =
        input.duration !== undefined
          ? input.duration
          : variant === 'loading'
            ? null
            : DEFAULT_DURATION;
      const record: ToastRecord = {
        id,
        variant,
        title: input.title,
        ...(input.description !== undefined ? { description: input.description } : {}),
        duration,
      };
      setToasts((prev) => {
        const existing = prev.some((t) => t.id === id);
        const next = existing ? prev.map((t) => (t.id === id ? record : t)) : [...prev, record];
        // Cap the queue: drop the oldest non-loading toast when we overflow.
        if (next.length <= MAX_VISIBLE) return next;
        const removable = next.find((t) => t.variant !== 'loading');
        return removable
          ? next.filter((t) => t.id !== removable.id)
          : next.slice(next.length - MAX_VISIBLE);
      });
      arm(id, duration);
    },
    [arm],
  );

  const api = useMemo<ToastApi>(() => {
    const show = (variant: ToastVariant, input: ToastInput | string) => {
      const id = nextId();
      upsert(id, variant, normalize(input));
      return id;
    };
    return {
      show,
      success: (input) => show('success', input),
      error: (input) => show('error', input),
      info: (input) => show('info', input),
      loading: (input) => show('loading', input),
      update: (id, variant, input) => upsert(id, variant, normalize(input)),
      dismiss,
      promise: async <T,>(promise: Promise<T>, messages: PromiseMessages<T>) => {
        const id = nextId();
        upsert(id, 'loading', { title: messages.loading });
        try {
          const value = await promise;
          const title =
            typeof messages.success === 'function' ? messages.success(value) : messages.success;
          upsert(id, 'success', { title });
          return value;
        } catch (err) {
          const title =
            typeof messages.error === 'function'
              ? messages.error(err)
              : messages.error || toUserMessage(err);
          upsert(id, 'error', { title });
          throw err;
        }
      },
    };
  }, [upsert, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {/* Polite: a toast is confirmation, never an interruption. Errors that must
            block the user belong in an inline <ErrorState>, not here. */}
        <div aria-live="polite" aria-atomic="false" className="contents">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                className="pointer-events-auto w-full max-w-sm"
                variants={toastVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={getTransition(toastTransition)}
              >
                <Toast
                  variant={t.variant}
                  title={t.title}
                  {...(t.description !== undefined ? { description: t.description } : {})}
                  onDismiss={() => dismiss(t.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
