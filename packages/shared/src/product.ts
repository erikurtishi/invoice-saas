import { z } from 'zod';

import { optionalText } from './text.js';

/**
 * Product / service payload shapes (backlog Epic 2.2). Imported by `apps/api` for
 * request validation and by `apps/web` for the product form resolver, the list
 * page and the product picker (2.2.5).
 *
 * A Product is a tenant-owned entity (decision D3 — owner column `tenantId` →
 * `users.id`, scope injected centrally) and is soft-deleted (decision D4): a
 * deleted product is hidden from the list and the picker but still resolves for
 * invoices that already reference it.
 *
 * Money and rates cross the wire as **integers** — `defaultPriceMinor` in minor
 * units, `defaultTaxRateBp` in basis points — never decimal strings. The web form
 * converts to/from the human decimal with `./money.ts`; storage matches the wire.
 * A product's price is implicitly in the tenant's `defaultCurrency` (decision
 * D17): there is no per-product currency and no FX — it is a line-item prefill the
 * user can adjust on an invoice in any currency.
 */

export const PRODUCT_SORT_VALUES = ['name', '-name', 'newest', 'oldest'] as const;
export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];

export const PRODUCT_PAGE_SIZE = 25;
export const PRODUCT_PAGE_SIZE_MAX = 100;

/** ~10 million major units — a sanity ceiling, not a business rule. */
export const PRODUCT_PRICE_MINOR_MAX = 1_000_000_000;
/** 100_000 bp = 1000%. Generous headroom over any real tax rate. */
export const PRODUCT_TAX_RATE_BP_MAX = 100_000;

/**
 * The editable product (backlog 2.2.3). The create dialog and the edit form both
 * submit this whole object; the API replaces the stored values with it wholesale
 * (a PATCH in verb only — no partial updates, same rule as client / profile).
 */
export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(200, 'Name is too long.'),
  description: optionalText(2000),
  /** Free-text unit label ("hour", "piece", "kg"). Not an enum — units vary widely. */
  unit: optionalText(24),
  /** Minor units, tenant default currency. `null` → no standard price (entered per invoice). */
  defaultPriceMinor: z
    .number()
    .int('Price must be a whole number of minor units.')
    .min(0, 'Price cannot be negative.')
    .max(PRODUCT_PRICE_MINOR_MAX, 'That price is too large.')
    .nullable()
    .default(null),
  /** Basis points (1800 = 18.00%). `0` means no tax. */
  defaultTaxRateBp: z
    .number()
    .int('Tax rate must be a whole number of basis points.')
    .min(0, 'Tax rate cannot be negative.')
    .max(PRODUCT_TAX_RATE_BP_MAX, 'That tax rate is too high.')
    .default(0),
});
export type ProductInput = z.infer<typeof productInputSchema>;

/** What `GET /products/:id` returns and what create / update echo back. */
export const productResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  unit: z.string().nullable(),
  defaultPriceMinor: z.number().int().nullable(),
  defaultTaxRateBp: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductResponse = z.infer<typeof productResponseSchema>;

/**
 * Query string for `GET /products` (backlog 2.2.2 — "search + empty state"). `sort`
 * and the page numbers carry defaults so a bare `GET /products` is valid; the list
 * UI only surfaces the search box, but the API paginates regardless.
 */
export const productListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  sort: z.enum(PRODUCT_SORT_VALUES).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PRODUCT_PAGE_SIZE_MAX).default(PRODUCT_PAGE_SIZE),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productListResponseSchema = z.object({
  items: z.array(productResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type ProductListResponse = z.infer<typeof productListResponseSchema>;
