import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { HttpError } from './http-error';

/**
 * Maps a 422 `VALIDATION_ERROR` response back onto the form that produced it, so a
 * server-side rejection shows inline under the offending field — same place, same
 * look as a client-side Zod error (backlog X.7.12: inline, never a top summary).
 *
 * Returns true when at least one field error was applied, so the caller knows the
 * failure was field-level and it should NOT also show a form-wide message.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (!(error instanceof HttpError) || !error.fields) return false;

  let applied = false;
  for (const [path, messages] of Object.entries(error.fields)) {
    const message = messages[0];
    if (message) {
      setError(path as Path<T>, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}
