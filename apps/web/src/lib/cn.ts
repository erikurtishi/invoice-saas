import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class lists the way every component in `components/ui` composes its
 * variant classes with a caller's `className` override. `clsx` handles conditional
 * classes; `tailwind-merge` then resolves conflicts by keeping the last conflicting
 * utility (so `cn('px-2', 'px-4')` yields `px-4`, not both).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
