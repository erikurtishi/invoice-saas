import {
  businessProfileSchema,
  type BusinessProfileInput,
  type BusinessProfileResponse,
  PAPER_SIZES,
  PROFILE_CURRENCIES,
  PROFILE_LANGUAGES,
} from '@invoice-saas/shared';
import { useState } from 'react';
import { Controller } from 'react-hook-form';

import { useUpdateBusinessProfile } from '../../features/profile/use-profile';
import { useToast } from '../../hooks/use-toast';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';
import { FormField } from '../form/field';
import { FormBanner } from '../form/form-banner';
import { Button, Input, Select } from '../ui';
import { LogoField } from './logo-field';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  businessName: 'Business name',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  postalCode: 'Postal code',
  country: 'Country',
  taxId: 'Tax ID / VAT number',
  defaultCurrency: 'Default currency',
  paymentTerms: 'Default payment terms',
  paymentTermsHint: 'Days until an invoice is due after it is issued.',
  paperSize: 'Default paper size',
  language: 'Preferred language',
  save: 'Save changes',
  saved: 'Business profile saved.',
  requestFailed: "Couldn't save your profile. Try again.",
  sectionDetails: 'Business details',
  sectionDefaults: 'Invoice defaults',
} as const;

const PAPER_LABELS: Record<(typeof PAPER_SIZES)[number], string> = {
  A4: 'A4',
  LETTER: 'US Letter',
  LEGAL: 'Legal',
  A5: 'A5',
};

const LANGUAGE_LABELS: Record<(typeof PROFILE_LANGUAGES)[number], string> = {
  EN: 'English',
  SQ: 'Albanian — Shqip',
  MK: 'Macedonian — Македонски',
};

const CURRENCY_OPTIONS = PROFILE_CURRENCIES.map((code) => ({ value: code, label: code }));
const PAPER_OPTIONS = PAPER_SIZES.map((size) => ({ value: size, label: PAPER_LABELS[size] }));
const LANGUAGE_OPTIONS = PROFILE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_LABELS[code],
}));

/** Nulls from the API become `''` for the controlled inputs. */
function toFormValues(p: BusinessProfileResponse): BusinessProfileInput {
  return {
    businessName: p.businessName,
    addressLine1: p.addressLine1 ?? '',
    addressLine2: p.addressLine2 ?? '',
    city: p.city ?? '',
    postalCode: p.postalCode ?? '',
    country: p.country ?? '',
    taxId: p.taxId ?? '',
    defaultCurrency: p.defaultCurrency as BusinessProfileInput['defaultCurrency'],
    defaultPaymentTermsDays: p.defaultPaymentTermsDays,
    defaultPaperSize: p.defaultPaperSize,
    preferredLanguage: p.preferredLanguage,
  };
}

export interface BusinessProfileFormProps {
  profile: BusinessProfileResponse;
  /** `settings` (default): inline "saved" banner + toast, stays on the page.
   * `onboarding`: silent on success — the wizard advances via `onSaved`. */
  variant?: 'settings' | 'onboarding';
  submitLabel?: string;
  /** Hide the logo control (kept simple in the wizard's first step). */
  showLogo?: boolean;
  onSaved?: (profile: BusinessProfileResponse) => void;
}

export function BusinessProfileForm({
  profile,
  variant = 'settings',
  submitLabel,
  showLogo = true,
  onSaved,
}: BusinessProfileFormProps) {
  const { mutateAsync, isPending } = useUpdateBusinessProfile();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useZodForm(businessProfileSchema, { defaultValues: toFormValues(profile) });
  const { isDirty, isSubmitSuccessful, errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const saved = await mutateAsync(values).catch((err: unknown) => {
      if (!applyFieldErrors<BusinessProfileInput>(err, form.setError)) {
        setFormError(toUserMessage(err) || COPY.requestFailed);
      }
      throw err; // keep RHF's isSubmitSuccessful false on failure
    });
    form.reset(toFormValues(saved));
    if (variant === 'settings') toast.success(COPY.saved);
    onSaved?.(saved);
  });

  // Inline "saved" confirmation: shown after a successful submit until the next
  // edit dirties the form again. Derived from RHF state — no extra bookkeeping.
  const showSaved = variant === 'settings' && isSubmitSuccessful && !isDirty;

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e).catch(() => undefined);
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      {formError && <FormBanner variant="error">{formError}</FormBanner>}
      {showSaved && <FormBanner variant="success">{COPY.saved}</FormBanner>}

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          {COPY.sectionDetails}
        </legend>

        <FormField label={COPY.businessName} required error={errors.businessName?.message}>
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('businessName')}
              autoComplete="organization"
              invalid={invalid}
            />
          )}
        </FormField>

        {showLogo && <LogoField logoUrl={profile.logoUrl} />}

        <FormField label={COPY.addressLine1} error={errors.addressLine1?.message}>
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('addressLine1')}
              autoComplete="address-line1"
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField label={COPY.addressLine2} error={errors.addressLine2?.message}>
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
          <FormField label={COPY.city} error={errors.city?.message}>
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('city')}
                autoComplete="address-level2"
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField label={COPY.postalCode} error={errors.postalCode?.message}>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={COPY.country} error={errors.country?.message}>
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('country')}
                autoComplete="country-name"
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField label={COPY.taxId} error={errors.taxId?.message}>
            {({ controlProps, invalid }) => (
              <Input {...controlProps} {...form.register('taxId')} invalid={invalid} />
            )}
          </FormField>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          {COPY.sectionDefaults}
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={COPY.defaultCurrency} required error={errors.defaultCurrency?.message}>
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="defaultCurrency"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={COPY.defaultCurrency}
                    options={CURRENCY_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                    invalid={invalid}
                  />
                )}
              />
            )}
          </FormField>

          <FormField
            label={COPY.paymentTerms}
            required
            hint={COPY.paymentTermsHint}
            error={errors.defaultPaymentTermsDays?.message}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('defaultPaymentTermsDays')}
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                invalid={invalid}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={COPY.paperSize} required error={errors.defaultPaperSize?.message}>
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="defaultPaperSize"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={COPY.paperSize}
                    options={PAPER_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                    invalid={invalid}
                  />
                )}
              />
            )}
          </FormField>

          <FormField label={COPY.language} required error={errors.preferredLanguage?.message}>
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={COPY.language}
                    options={LANGUAGE_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                    invalid={invalid}
                  />
                )}
              />
            )}
          </FormField>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isPending} disabled={variant === 'settings' && !isDirty}>
          {submitLabel ?? COPY.save}
        </Button>
      </div>
    </form>
  );
}
