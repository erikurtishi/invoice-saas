import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs`, re-timing on every change. Used to keep a
 * fast-typed search box from firing a query per keystroke (client list 2.1.2, and
 * every later search / typeahead).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
