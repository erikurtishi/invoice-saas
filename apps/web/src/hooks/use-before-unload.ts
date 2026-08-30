import { useEffect } from 'react';

/**
 * Warn on tab close / reload while there are unsaved changes (backlog 4.4.3).
 * In-app navigation (clicking a nav link) is confirmed by the form's own Cancel
 * flow — a full router-level blocker needs a data router, which this app doesn't
 * use.
 */
export function useBeforeUnload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);
}
