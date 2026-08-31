import {
  CLIENT_ADDRESS_MODES,
  CLIENT_CURRENCIES,
  clientInputSchema,
  type ClientInput,
  type ClientResponse,
} from '@invoice-saas/shared';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useCreateClient, useUpdateClient } from '../../features/clients/use-clients';
import { useToast } from '../../hooks/use-toast';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';
import { FormField } from '../form/field';
import { FormBanner } from '../form/form-banner';
import { Button, Input, Select, Textarea } from '../ui';

const CURRENCY_DEFAULT = '' as const;

/**
 * Resolver schema: the shared `clientInputSchema` with `currency` widened to also
 * accept `''` — the Select's "Use business default" choice, which maps back to
 * `null` on submit (a `<Select>` value is always a string, never `null`).
 */
const clientFormSchema = clientInputSchema.extend({
  currency: z
    .union([z.enum(CLIENT_CURRENCIES), z.literal(CURRENCY_DEFAULT)])
    .default(CURRENCY_DEFAULT),
});
type ClientFormValues = z.infer<typeof clientFormSchema>;

/** Nulls from the API become `''` for the controlled inputs; a missing client (the
 * create case) starts from blank + sensible defaults. */
function toFormValues(client?: ClientResponse): ClientFormValues {
  return {
    name: client?.name ?? '',
    email: client?.email ?? '',
    taxId: client?.taxId ?? '',
    addressMode: client?.addressMode ?? 'STRUCTURED',
    addressLine1: client?.addressLine1 ?? '',
    addressLine2: client?.addressLine2 ?? '',
    city: client?.city ?? '',
    postalCode: client?.postalCode ?? '',
    country: client?.country ?? '',
    addressText: client?.addressText ?? '',
    currency: (client?.currency as ClientFormValues['currency']) ?? CURRENCY_DEFAULT,
    notes: client?.notes ?? '',
  };
}

export interface ClientFormProps {
  /** Present → edit that client; absent → create a new one. */
  client?: ClientResponse | undefined;
  /** `dialog` renders a Cancel button beside submit; `page` stands alone. */
  layout?: 'page' | 'dialog';
  onSaved?: ((client: ClientResponse) => void) | undefined;
  onCancel?: (() => void) | undefined;
}

export function ClientForm({ client, layout = 'page', onSaved, onCancel }: ClientFormProps) {
  const { t } = useTranslation();
  const isEdit = client !== undefined;

  const addressModeOptions = CLIENT_ADDRESS_MODES.map((mode) => ({
    value: mode,
    label:
      mode === 'STRUCTURED' ? t('clients.addressModeStructured') : t('clients.addressModeFreeText'),
  }));
  const currencyOptions = [
    { value: CURRENCY_DEFAULT, label: t('clients.currencyDefault') },
    ...CLIENT_CURRENCIES.map((code) => ({ value: code, label: code })),
  ];

  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useZodForm(clientFormSchema, { defaultValues: toFormValues(client) });
  const { errors, isDirty } = form.formState;
  const addressMode = form.watch('addressMode');

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const payload: ClientInput = {
      ...values,
      currency: values.currency === CURRENCY_DEFAULT ? null : values.currency,
    };

    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync({ id: client.id, input: payload })
        : await createMutation.mutateAsync(payload);
      form.reset(toFormValues(isEdit ? saved : undefined));
      toast.success(isEdit ? t('clients.savedToast') : t('clients.createdToast'));
      onSaved?.(saved);
    } catch (err) {
      if (!applyFieldErrors<ClientFormValues>(err, form.setError)) {
        setFormError(toUserMessage(err) || t('clients.requestFailed'));
      }
    }
  });

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e).catch(() => undefined);
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      {formError && <FormBanner variant="error">{formError}</FormBanner>}

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          {t('clients.sectionDetails')}
        </legend>

        <FormField label={t('clients.fieldName')} required error={errors.name?.message}>
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('name')}
              autoComplete="organization"
              invalid={invalid}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('clients.fieldEmail')}
            hint={t('clients.fieldEmailHint')}
            error={errors.email?.message}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('email')}
                type="email"
                autoComplete="email"
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField label={t('clients.fieldTaxId')} error={errors.taxId?.message}>
            {({ controlProps, invalid }) => (
              <Input {...controlProps} {...form.register('taxId')} invalid={invalid} />
            )}
          </FormField>
        </div>

        <FormField
          label={t('clients.fieldCurrency')}
          hint={t('clients.fieldCurrencyHint')}
          error={errors.currency?.message}
        >
          {({ controlProps, invalid }) => (
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <Select
                  id={controlProps.id}
                  aria-label={t('clients.fieldCurrency')}
                  options={currencyOptions}
                  value={field.value ?? CURRENCY_DEFAULT}
                  onValueChange={field.onChange}
                  invalid={invalid}
                />
              )}
            />
          )}
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          {t('clients.sectionAddress')}
        </legend>

        <FormField
          label={t('clients.fieldAddressMode')}
          required
          error={errors.addressMode?.message}
        >
          {({ controlProps, invalid }) => (
            <Controller
              control={form.control}
              name="addressMode"
              render={({ field }) => (
                <Select
                  id={controlProps.id}
                  aria-label={t('clients.fieldAddressMode')}
                  options={addressModeOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  invalid={invalid}
                />
              )}
            />
          )}
        </FormField>

        {addressMode === 'STRUCTURED' ? (
          <>
            <FormField label={t('clients.fieldAddressLine1')} error={errors.addressLine1?.message}>
              {({ controlProps, invalid }) => (
                <Input
                  {...controlProps}
                  {...form.register('addressLine1')}
                  autoComplete="address-line1"
                  invalid={invalid}
                />
              )}
            </FormField>
            <FormField label={t('clients.fieldAddressLine2')} error={errors.addressLine2?.message}>
              {({ controlProps, invalid }) => (
                <Input
                  {...controlProps}
                  {...form.register('addressLine2')}
                  autoComplete="address-line2"
                  invalid={invalid}
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('clients.fieldCity')} error={errors.city?.message}>
                {({ controlProps, invalid }) => (
                  <Input
                    {...controlProps}
                    {...form.register('city')}
                    autoComplete="address-level2"
                    invalid={invalid}
                  />
                )}
              </FormField>
              <FormField label={t('clients.fieldPostalCode')} error={errors.postalCode?.message}>
                {({ controlProps, invalid }) => (
                  <Input
                    {...controlProps}
                    {...form.register('postalCode')}
                    autoComplete="postal-code"
                    invalid={invalid}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t('clients.fieldCountry')} error={errors.country?.message}>
              {({ controlProps, invalid }) => (
                <Input
                  {...controlProps}
                  {...form.register('country')}
                  autoComplete="country-name"
                  invalid={invalid}
                />
              )}
            </FormField>
          </>
        ) : (
          <FormField
            label={t('clients.fieldAddressText')}
            hint={t('clients.fieldAddressTextHint')}
            error={errors.addressText?.message}
          >
            {({ controlProps, invalid }) => (
              <Textarea
                {...controlProps}
                {...form.register('addressText')}
                rows={4}
                invalid={invalid}
              />
            )}
          </FormField>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <FormField
          label={t('clients.fieldNotes')}
          hint={t('clients.fieldNotesHint')}
          error={errors.notes?.message}
        >
          {({ controlProps, invalid }) => (
            <Textarea {...controlProps} {...form.register('notes')} rows={3} invalid={invalid} />
          )}
        </FormField>
      </fieldset>

      <div className="flex justify-end gap-3">
        {layout === 'dialog' && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" isLoading={isPending} disabled={isEdit && !isDirty}>
          {isEdit ? t('clients.formEditSubmit') : t('clients.formCreateSubmit')}
        </Button>
      </div>
    </form>
  );
}
