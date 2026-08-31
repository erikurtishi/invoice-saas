import {
  amountStringToMinor,
  bpToPercentString,
  minorToAmountString,
  percentStringToBp,
  PRODUCT_PRICE_MINOR_MAX,
  PRODUCT_TAX_RATE_BP_MAX,
  productInputSchema,
  type ProductInput,
  type ProductResponse,
} from '@invoice-saas/shared';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useCreateProduct, useUpdateProduct } from '../../features/products/use-products';
import { useBusinessProfile } from '../../features/profile/use-profile';
import { useToast } from '../../hooks/use-toast';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';
import { FormField } from '../form/field';
import { FormBanner } from '../form/form-banner';
import { Button, Input, Textarea } from '../ui';

/**
 * Resolver schema: the shared `productInputSchema` with the two integer money
 * fields swapped for the decimal strings the inputs actually hold. `''` is a
 * valid (empty) value for both; `onSubmit` converts to minor units / basis points
 * with the shared `money.ts` helpers before hitting the API.
 *
 * Built per-render from `t` so the `.refine()` messages are localised (X.1.2).
 */
function buildProductFormSchema(t: TFunction) {
  return productInputSchema.omit({ defaultPriceMinor: true, defaultTaxRateBp: true }).extend({
    priceInput: z
      .string()
      .trim()
      .refine((v) => v === '' || amountStringToMinor(v) !== null, t('products.priceFormat'))
      .refine((v) => {
        const minor = amountStringToMinor(v);
        return v === '' || (minor !== null && minor <= PRODUCT_PRICE_MINOR_MAX);
      }, t('products.priceRange')),
    taxRateInput: z
      .string()
      .trim()
      .refine((v) => v === '' || percentStringToBp(v) !== null, t('products.taxRateFormat'))
      .refine((v) => {
        const bp = percentStringToBp(v);
        return v === '' || (bp !== null && bp <= PRODUCT_TAX_RATE_BP_MAX);
      }, t('products.taxRateRange')),
  });
}
type ProductFormValues = z.infer<ReturnType<typeof buildProductFormSchema>>;

function toFormValues(product?: ProductResponse): ProductFormValues {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    unit: product?.unit ?? '',
    priceInput:
      product?.defaultPriceMinor != null ? minorToAmountString(product.defaultPriceMinor) : '',
    taxRateInput: product ? bpToPercentString(product.defaultTaxRateBp) : '',
  };
}

export interface ProductFormProps {
  /** Present → edit that product; absent → create a new one. */
  product?: ProductResponse | undefined;
  layout?: 'page' | 'dialog';
  onSaved?: ((product: ProductResponse) => void) | undefined;
  onCancel?: (() => void) | undefined;
}

export function ProductForm({ product, layout = 'page', onSaved, onCancel }: ProductFormProps) {
  const { t } = useTranslation();
  const isEdit = product !== undefined;
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const toast = useToast();
  const profile = useBusinessProfile();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => buildProductFormSchema(t), [t]);
  const form = useZodForm(schema, { defaultValues: toFormValues(product) });
  const { errors, isDirty } = form.formState;

  const priceHint = profile.data
    ? t('products.priceHintWithCurrency', { code: profile.data.defaultCurrency })
    : t('products.priceHint');

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const payload: ProductInput = {
      name: values.name,
      description: values.description,
      unit: values.unit,
      defaultPriceMinor: values.priceInput === '' ? null : amountStringToMinor(values.priceInput),
      defaultTaxRateBp:
        values.taxRateInput === '' ? 0 : (percentStringToBp(values.taxRateInput) ?? 0),
    };

    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync({ id: product.id, input: payload })
        : await createMutation.mutateAsync(payload);
      form.reset(toFormValues(isEdit ? saved : undefined));
      toast.success(isEdit ? t('products.savedToast') : t('products.createdToast'));
      onSaved?.(saved);
    } catch (err) {
      if (!applyFieldErrors<ProductFormValues>(err, form.setError)) {
        setFormError(toUserMessage(err) || t('products.requestFailed'));
      }
    }
  });

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e).catch(() => undefined);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {formError && <FormBanner variant="error">{formError}</FormBanner>}

      <fieldset className="flex flex-col gap-4" disabled={isPending}>
        <FormField label={t('products.fieldName')} required error={errors.name?.message}>
          {({ controlProps, invalid }) => (
            <Input {...controlProps} {...form.register('name')} invalid={invalid} />
          )}
        </FormField>

        <FormField
          label={t('products.fieldDescription')}
          hint={t('products.fieldDescriptionHint')}
          error={errors.description?.message}
        >
          {({ controlProps, invalid }) => (
            <Textarea
              {...controlProps}
              {...form.register('description')}
              rows={3}
              invalid={invalid}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label={t('products.fieldUnit')}
            hint={t('products.fieldUnitHint')}
            error={errors.unit?.message}
          >
            {({ controlProps, invalid }) => (
              <Input {...controlProps} {...form.register('unit')} invalid={invalid} />
            )}
          </FormField>

          <FormField
            label={t('products.fieldPrice')}
            hint={priceHint}
            error={errors.priceInput?.message}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('priceInput')}
                inputMode="decimal"
                placeholder="0.00"
                invalid={invalid}
              />
            )}
          </FormField>

          <FormField
            label={t('products.fieldTaxRate')}
            hint={t('products.taxRateHint')}
            error={errors.taxRateInput?.message}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('taxRateInput')}
                inputMode="decimal"
                placeholder="0"
                invalid={invalid}
              />
            )}
          </FormField>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3">
        {layout === 'dialog' && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" isLoading={isPending} disabled={isEdit && !isDirty}>
          {isEdit ? t('products.formEditSubmit') : t('products.formCreateSubmit')}
        </Button>
      </div>
    </form>
  );
}
