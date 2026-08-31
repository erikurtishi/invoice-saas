import { useSyncExternalStore } from 'react';

/**
 * Cookie-consent state (backlog X.4.3). Two categories only: strictly necessary
 * (always on — the session cookie, language + this preference in localStorage)
 * and analytics (off until the visitor opts in). The choice is persisted in
 * localStorage and shared app-wide through a tiny external store so the banner
 * and `lib/analytics.ts` never disagree.
 *
 * `null` = not decided yet → the banner shows.
 */
export type ConsentChoice = 'all' | 'essential';

const STORAGE_KEY = 'cookie-consent';
const listeners = new Set<() => void>();

function read(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'all' || raw === 'essential' ? raw : null;
  } catch {
    return null;
  }
}

let current: ConsentChoice | null = read();

/** Non-React accessor — `lib/analytics.ts` uses this at init time. */
export function getConsent(): ConsentChoice | null {
  return current;
}

/** True only once the visitor has actively opted into analytics. */
export function analyticsAllowed(): boolean {
  return current === 'all';
}

export function setConsent(choice: ConsentChoice): void {
  current = choice;
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode / storage disabled — the choice still holds for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `{ choice, decided, accept, reject }` for the banner and anywhere that needs
 *  to react to the consent state. */
export function useConsent() {
  const choice = useSyncExternalStore(subscribe, getConsent, () => null);
  return {
    choice,
    decided: choice !== null,
    acceptAll: () => setConsent('all'),
    essentialOnly: () => setConsent('essential'),
  };
}
