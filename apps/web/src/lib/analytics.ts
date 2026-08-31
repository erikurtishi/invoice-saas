import { analyticsAllowed } from '../features/consent/use-consent';

/**
 * Analytics seam (backlog X.4.3 — "analytics blocked until consent").
 *
 * There is no analytics vendor wired up yet. When one is chosen, initialise it
 * **here and only here**, and keep the `analyticsAllowed()` gate: nothing that
 * sets a non-essential cookie or sends a pageview may run unless the visitor has
 * opted in through the cookie banner. `App` calls `initAnalytics()` on load and
 * again when the banner choice changes, so opting in takes effect without a
 * reload and a later "essential only" choice simply stops future init.
 */
export function initAnalytics(): void {
  if (!analyticsAllowed()) return;

  // TODO(analytics): load + start the chosen provider here, gated by the check
  // above. Until then this is intentionally a no-op.
}
