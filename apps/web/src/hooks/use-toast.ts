import { createContext, useContext } from 'react';

import type { ToastVariant } from '../components/ui/toast';

/**
 * Backlog 0.4b.6 — the toast queue's public API. The provider that owns the queue,
 * timers, `aria-live` region and Motion stacking lives in
 * `components/state/toast-viewport.tsx`; this file is only the context + hook so a
 * component file never also exports a hook (keeps Fast Refresh happy).
 */

export interface ToastRecord {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** `loading` toasts never auto-dismiss; everything else defaults to ~5s. `null`
   * pins a toast open until it is dismissed or updated. */
  duration: number | null;
}

export type ToastInput = Omit<Partial<ToastRecord>, 'id' | 'variant'> & { title: string };

export interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((err: unknown) => string);
}

export interface ToastApi {
  /** Low-level: add a toast, get its id back. */
  show: (variant: ToastVariant, input: ToastInput) => string;
  success: (input: ToastInput | string) => string;
  error: (input: ToastInput | string) => string;
  info: (input: ToastInput | string) => string;
  /** Returns an id; resolve it later with `update` / `dismiss`. */
  loading: (input: ToastInput | string) => string;
  /** Transition an existing toast (e.g. a `loading` one) to a new variant/content. */
  update: (id: string, variant: ToastVariant, input: ToastInput) => void;
  dismiss: (id: string) => void;
  /** loading → success/error in one call. Re-throws so callers can still `catch`. */
  promise: <T>(promise: Promise<T>, messages: PromiseMessages<T>) => Promise<T>;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return ctx;
}
