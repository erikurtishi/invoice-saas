import { type Transition, type Variants, useReducedMotion } from 'motion/react';

/**
 * Shared Motion configs (backlog 0.4.4) so animation feels like one system instead
 * of every screen inventing its own timing. Import these into any `motion.*`
 * element rather than writing new `transition`/`variants` inline.
 *
 * `prefers-reduced-motion` handling (0.4.5) is layered two ways: `MotionConfig` in
 * `main.tsx` is the app-wide backstop for every `motion.*` element, including future
 * ones that don't go through this file; every preset here also collapses to a near-
 * instant transition on its own via `getTransition()`, so nothing exported below
 * depends on the global config to be correct. `index.css` has the third layer, for
 * CSS transitions/animations that aren't Motion at all (Radix's `data-state`
 * transitions, Tailwind's `animate-pulse`).
 *
 * `useReducedMotion` is re-exported here so anywhere that needs to *skip* a
 * motion-dependent feature entirely (not just speed it up — e.g. a drag-to-reorder
 * interaction in the template editor, X.3.2) has one place to import it from.
 */
export { useReducedMotion };

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

// --- Switch thumb (X.3.2 toggle micro-interaction) --------------------------
// A short spring on the knob so a toggle feels physical, not instantaneous.
// `MotionConfig reducedMotion="user"` flattens it to an instant snap, so it needs
// no `getTransition()` wrapper.
export const switchThumbSpring: Transition = { type: 'spring', stiffness: 500, damping: 34 };

// --- Toast enter/exit (used once the queue system lands in 0.4b.6) -----------

export const toastTransition: Transition = { duration: 0.2, ease: EASE_OUT };
export const toastVariants: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};
