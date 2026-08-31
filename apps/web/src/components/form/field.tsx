import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';

/**
 * Backlog 0.4b.7 — the inline field-validation pattern, one component so every form
 * looks and behaves the same: label, the control, an optional hint, and the error
 * text directly under the input (five-states "Error": field validation is inline,
 * under the field — never a summary at the top).
 *
 * It owns the id wiring so accessibility isn't left to each call site: the control
 * gets `id` + `aria-invalid`, and `aria-describedby` points at whichever of the
 * hint / error is currently shown.
 *
 *   const form = useZodForm(clientSchema);
 *   <FormField label={t('client.name')} error={form.formState.errors.name?.message}>
 *     {({ controlProps }) => <Input {...controlProps} {...form.register('name')} />}
 *   </FormField>
 *
 * `error` is a plain string — feed it `errors.<field>?.message` from React Hook
 * Form, which is already the i18n'd message from the Zod schema.
 */

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

export interface FormFieldProps {
  label: ReactNode;
  /** RHF's `errors.<name>?.message` (always `string | undefined`). Presence of a
   * non-empty string switches the field to its error state. */
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  /** A small node rendered just after the label — e.g. the "AI-filled, verify"
   * marker on fields an AI draft populated (backlog 7.2.3). */
  badge?: ReactNode;
  children: (args: { controlProps: FieldControlProps; invalid: boolean }) => ReactNode;
}

export function FormField({
  label,
  error,
  hint,
  required = false,
  className,
  badge,
  children,
}: FormFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = error !== undefined && error !== '';

  const describedBy =
    [invalid ? errorId : null, hint != null ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <span>
          {label}
          {!required && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({t('common.optionalInline')})
            </span>
          )}
        </span>
        {badge}
      </label>

      {children({
        controlProps: { id, 'aria-invalid': invalid, 'aria-describedby': describedBy },
        invalid,
      })}

      {hint != null && !invalid && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {invalid && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
