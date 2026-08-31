import {
  businessProfileSchema,
  LANGUAGE_ENDONYMS,
  type BusinessProfileInput,
  type BusinessProfileResponse,
  PAPER_SIZES,
  PROFILE_CURRENCIES,
  PROFILE_LANGUAGES,
} from '@invoice-saas/shared';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useUpdateBusinessProfile } from '../../features/profile/use-profile';
import { useToast } from '../../hooks/use-toast';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';
import { FormField } from '../form/field';
import { FormBanner } from '../form/form-banner';
import { Button, Input, Select } from '../ui';
import { LogoField } from './logo-field';

const CURRENCY_OPTIONS = PROFILE_CURRENCIES.map((code) => ({ value: code, label: code }));
const LANGUAGE_OPTIONS = PROFILE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_ENDONYMS[code],
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
    uiLanguage: p.uiLanguage,
    invoiceLanguage: p.invoiceLanguage,
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
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useUpdateBusinessProfile();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const paperOptions = PAPER_SIZES.map((size) => ({
    value: size,
    label:
      size === 'LETTER'
        ? t('profile.paperLetter')
        : size === 'LEGAL'
          ? t('profile.paperLegal')
          : size,
  }));

  const form = useZodForm(businessProfileSchema, { defaultValues: toFormValues(profile) });
  const { isDirty, isSubmitSuccessful, errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const saved = await mutateAsync(values).catch((err: unknown) => {
      if (!applyFieldErrors<BusinessProfileInput>(err, form.setError)) {
        setFormError(toUserMessage(err) || t('profile.requestFailed'));
      }
      throw err; // keep RHF's isSubmitSuccessful false on failure
    });
    form.reset(toFormValues(saved));
    if (variant === 'settings') toast.success(t('profile.saved'));
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
      {showSaved && <FormBanner variant="success">{t('profile.saved')}</FormBanner>}

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          {t('profile.sectionDetails')}
        </legend>

        <FormField label={t('profile.businessName')} required error={errors.businessName?.message}>
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

        <FormField label={t('profile.addressLine1')} error={errors.addressLine1?.message}>
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('addressLine1')}
              autoComplete="address-line1"
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField label={t('profile.addressLine2')} error={errors.addressLine2?.message}>
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
          <FormField label={t('profile.city')} error={errors.city?.message}>
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('city')}
                autoComplete="address-level2"
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField label={t('profile.postalCode')} error={errors.postalCode?.message}>
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
          <FormField label={t('profile.country')} error={errors.country?.message}>
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('country')}
                autoComplete="country-name"
                invalid={invalid}
              />
            )}
          </FormField>
          <FormField label={t('profile.taxId')} error={errors.taxId?.message}>
            {({ controlProps, invalid }) => (
              <Input {...controlProps} {...form.register('taxId')} invalid={invalid} />
            )}
          </FormField>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <legend className="mb-1 text-sm font-semibold text-foreground">
          {t('profile.sectionDefaults')}
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('profile.defaultCurrency')}
            required
            error={errors.defaultCurrency?.message}
          >
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="defaultCurrency"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={t('profile.defaultCurrency')}
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
            label={t('profile.paymentTerms')}
            required
            hint={t('profile.paymentTermsHint')}
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
          <FormField
            label={t('profile.paperSize')}
            required
            error={errors.defaultPaperSize?.message}
          >
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="defaultPaperSize"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={t('profile.paperSize')}
                    options={paperOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    invalid={invalid}
                  />
                )}
              />
            )}
          </FormField>

          <FormField
            label={t('language.invoiceLanguage')}
            required
            hint={t('language.invoiceLanguageHint')}
            error={errors.invoiceLanguage?.message}
          >
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="invoiceLanguage"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={t('language.invoiceLanguage')}
                    options={LANGUAGE_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                    invalid={invalid}
                  />
                )}
              />
            )}
          </FormField>

          <FormField
            label={t('language.appLanguage')}
            required
            hint={t('language.appLanguageHint')}
            error={errors.uiLanguage?.message}
          >
            {({ controlProps, invalid }) => (
              <Controller
                control={form.control}
                name="uiLanguage"
                render={({ field }) => (
                  <Select
                    id={controlProps.id}
                    aria-label={t('language.appLanguage')}
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
          {submitLabel ?? t('common.saveChanges')}
        </Button>
      </div>
    </form>
  );
}
