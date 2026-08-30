import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSyncExternalStore } from 'react';

import { getTransition } from '../../lib/motion-presets';

/**
 * Backlog 0.4b.9 — a persistent banner while the browser reports no connection, so
 * a user never assumes an edit saved when the request never left the machine.
 * Reads `navigator.onLine` through `useSyncExternalStore` (no `useEffect` fetch
 * pattern, and correct under StrictMode double-invoke).
 */

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  message: "You're offline — changes won't save until you reconnect.",
} as const;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getSnapshot = () => navigator.onLine;
// SSR / no-DOM: assume online so nothing renders.
const getServerSnapshot = () => true;

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          aria-live="assertive"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={getTransition({ duration: 0.2 })}
          className="overflow-hidden bg-warning text-warning-foreground"
        >
          <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2 text-sm font-medium sm:px-6 lg:px-8">
            <WifiOff className="size-4 shrink-0" aria-hidden />
            {COPY.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
