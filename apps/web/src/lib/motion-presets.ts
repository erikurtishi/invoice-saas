import type { Transition, Variants } from 'motion/react';

/**
 * Shared Motion configs (backlog 0.4.4) so animation feels like one system instead
 * of every screen inventing its own timing. Import these into any `motion.*`
 * element rather than writing new `transition`/`variants` inline.
 *
 * Full `prefers-reduced-motion` enforcement across the app is task 0.4.5 / X.3.4 —
 * but every preset here already collapses to a near-instant, motion-free transition
 * when it's set, via `getTransition()`. Nothing exported from this file has to be
 * retrofitted later.
 */

const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1];
const EASE_IN_OUT: Transition['ease'] = [0.65, 0, 0.35, 1];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Wrap a preset's `transition` with this so reduced-motion users get an
 * effectively instant change instead of the full animation. */
export function getTransition(transition: Transition): Transition {
  return prefersReducedMotion() ? { ...transition, duration: 0 } : transition;
}

// --- Modal enter/exit (backdrop + content) ---------------------------------

export const modalOverlayTransition: Transition = { duration: 0.15, ease: EASE_OUT };
export const modalOverlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContentTransition: Transition = { duration: 0.18, ease: EASE_OUT };
export const modalContentVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 8 },
};

// --- Page transition ---------------------------------------------------------

export const pageTransition: Transition = { duration: 0.2, ease: EASE_IN_OUT };
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

// --- List stagger (invoice/client/product/template lists) --------------------

export const listContainerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04 } },
};

export const listItemTransition: Transition = { duration: 0.15, ease: EASE_OUT };
export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
};

// --- Toast enter/exit (used once the queue system lands in 0.4b.6) -----------

export const toastTransition: Transition = { duration: 0.2, ease: EASE_OUT };
export const toastVariants: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};
