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
import { useState } from 'react';
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

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  name: 'Name',
  description: 'Description',
  descriptionHint: 'Optional detail that pre-fills the invoice line.',
  unit: 'Unit',
  unitHint: 'e.g. hour, piece, kg, day.',
  price: 'Default price',
  priceHintWithCurrency: (code: string) => `Per unit, in ${code}. Leave blank if it varies.`,
  priceHint: 'Per unit, in your business default currency. Leave blank if it varies.',
  priceFormat: 'Enter an amount like 10.50.',
  priceRange: 'That price is too large.',
  taxRate: 'Default tax rate',
  taxRateHint: 'Percent, e.g. 18 or 8.25. Leave blank for no tax.',
  taxRateFormat: 'Enter a rate like 18 or 8.25.',
  taxRateRange: 'That tax rate is too high.',
  createSubmit: 'Add product',
  editSubmit: 'Save changes',
  cancel: 'Cancel',
  createdToast: 'Product added.',
  savedToast: 'Product saved.',
  requestFailed: "Couldn't save this product. Try again.",
} as const;

/**
 * Resolver schema: the shared `productInputSchema` with the two integer money
 * fields swapped for the decimal strings the inputs actually hold. `''` is a
 * valid (empty) value for both; `onSubmit` converts to minor units / basis points
 * with the shared `money.ts` helpers before hitting the API.
 */
const productFormSchema = productInputSchema
  .omit({ defaultPriceMinor: true, defaultTaxRateBp: true })
  .extend({
    priceInput: z
      .string()
      .trim()
      .refine((v) => v === '' || amountStringToMinor(v) !== null, COPY.priceFormat)
      .refine((v) => {
        const minor = amountStringToMinor(v);
        return v === '' || (minor !== null && minor <= PRODUCT_PRICE_MINOR_MAX);
      }, COPY.priceRange),
    taxRateInput: z
      .string()
      .trim()
      .refine((v) => v === '' || percentStringToBp(v) !== null, COPY.taxRateFormat)
      .refine((v) => {
        const bp = percentStringToBp(v);
        return v === '' || (bp !== null && bp <= PRODUCT_TAX_RATE_BP_MAX);
      }, COPY.taxRateRange),
  });
type ProductFormValues = z.infer<typeof productFormSchema>;

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
  const isEdit = product !== undefined;
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const toast = useToast();
  const profile = useBusinessProfile();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useZodForm(productFormSchema, { defaultValues: toFormValues(product) });
  const { errors, isDirty } = form.formState;

  const priceHint = profile.data
    ? COPY.priceHintWithCurrency(profile.data.defaultCurrency)
    : COPY.priceHint;

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
      toast.success(isEdit ? COPY.savedToast : COPY.createdToast);
      onSaved?.(saved);
    } catch (err) {
      if (!applyFieldErrors<ProductFormValues>(err, form.setError)) {
        setFormError(toUserMessage(err) || COPY.requestFailed);
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
        <FormField label={COPY.name} required error={errors.name?.message}>
          {({ controlProps, invalid }) => (
            <Input {...controlProps} {...form.register('name')} invalid={invalid} />
          )}
        </FormField>

        <FormField
          label={COPY.description}
          hint={COPY.descriptionHint}
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
          <FormField label={COPY.unit} hint={COPY.unitHint} error={errors.unit?.message}>
            {({ controlProps, invalid }) => (
              <Input {...controlProps} {...form.register('unit')} invalid={invalid} />
            )}
          </FormField>

          <FormField label={COPY.price} hint={priceHint} error={errors.priceInput?.message}>
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
            label={COPY.taxRate}
            hint={COPY.taxRateHint}
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
            {COPY.cancel}
          </Button>
        )}
        <Button type="submit" isLoading={isPending} disabled={isEdit && !isDirty}>
          {isEdit ? COPY.editSubmit : COPY.createSubmit}
        </Button>
      </div>
    </form>
  );
}
