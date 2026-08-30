import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * Backlog 0.4b.7 — the single wiring point for "Zod schema → React Hook Form".
 * Every form calls this instead of `useForm` directly, so validation mode and the
 * resolver are configured identically everywhere and the schema (shared with the
 * backend via `@invoice-saas/shared`) is the only source of validation truth.
 *
 * `mode: 'onBlur'` + `reValidateMode: 'onChange'`: don't shout at a field the user
 * hasn't finished with, but once it's been flagged, clear the error the moment it's
 * fixed. Pair the returned `formState.errors` with `<FormField>` for the inline
 * error text.
 */
export function useZodForm<TValues extends FieldValues>(
  schema: ZodType<TValues>,
  options?: Omit<UseFormProps<TValues, unknown, TValues>, 'resolver'>,
): UseFormReturn<TValues, unknown, TValues> {
  // The zod↔RHF generic boundary produces two structurally-identical `Resolver`
  // types that don't unify nominally; casting here keeps the public signature
  // clean and `any`-free.
  const resolver = zodResolver(schema as unknown as Parameters<typeof zodResolver>[0]) as Resolver<
    TValues,
    unknown,
    TValues
  >;

  return useForm<TValues, unknown, TValues>({
    resolver,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    ...options,
  });
}
