import { z } from 'zod';

import { PROFILE_CURRENCIES } from './profile.js';
import { optionalText } from './text.js';

/**
 * Client payload shapes (backlog Epic 2.1). Imported by `apps/api` for request
 * validation and by `apps/web` for the client form resolver and the list page, so
 * the form, the `POST/PATCH /clients` endpoints and the list query can never
 * disagree on a field.
 *
 * A Client is a tenant-owned entity (decision D3 — the owning column is `tenantId`,
 * referencing `users.id`; the scope is injected centrally, never per-route). It is
 * soft-deleted (decision D4): a deleted client is hidden from lists and pickers but
 * still resolves for invoices that already reference it.
 */

/**
 * Two ways to hold a client's address, chosen per client:
 * - `STRUCTURED` — line1/line2/city/postalCode/country, mirrors the business
 *   profile so the invoice renderer's client block is symmetric with its business
 *   block.
 * - `FREE_TEXT` — a single multi-line blob, printed on the invoice as entered.
 */
export const CLIENT_ADDRESS_MODES = ['STRUCTURED', 'FREE_TEXT'] as const;
export type ClientAddressMode = (typeof CLIENT_ADDRESS_MODES)[number];

/**
 * Currency choices for the per-client override — the same curated list as the
 * business profile (decision: reuse `PROFILE_CURRENCIES`). `null` means "use the
 * tenant's `defaultCurrency`"; a saved invoice still freezes its own currency
 * (4.2.7).
 */
export const CLIENT_CURRENCIES = PROFILE_CURRENCIES;
export type ClientCurrency = (typeof CLIENT_CURRENCIES)[number];

/** Sort options for the client list (backlog 2.1.2). */
export const CLIENT_SORT_VALUES = ['name', '-name', 'newest', 'oldest'] as const;
export type ClientSort = (typeof CLIENT_SORT_VALUES)[number];

/** Default page size for the client list. */
export const CLIENT_PAGE_SIZE = 25;
export const CLIENT_PAGE_SIZE_MAX = 100;

/**
 * Optional email: trimmed and lower-cased, `''` normalised to `null`. Optional
 * because Send is simply disabled when a client has no email (spec §91) — it is
 * never a required field.
 */
const clientEmail = z
  .string()
  .trim()
  .max(320, 'Email is too long.')
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => value === '' || z.string().email().safeParse(value).success,
    'Enter a valid email address.',
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

/**
 * The editable client (backlog 2.1.3). The create dialog and the edit form both
 * submit this whole object; the API replaces the stored values with it wholesale
 * (a PATCH in verb only — no partial updates, same rule as the profile).
 *
 * Address fields for both modes are always accepted; `addressMode` decides which
 * set the UI shows and the renderer reads. Nothing is cross-required — a client
 * with no address at all is valid.
 */
export const clientInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter the client name.').max(200, 'Client name is too long.'),
  email: clientEmail,
  /** VAT / tax registration number. Plain string, format varies by country. */
  taxId: optionalText(64),

  addressMode: z.enum(CLIENT_ADDRESS_MODES).default('STRUCTURED'),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  postalCode: optionalText(32),
  /** Free text — printed as entered. Not an ISO country code. */
  country: optionalText(60),
  /** The whole address as one blob, used when `addressMode === 'FREE_TEXT'`. */
  addressText: optionalText(600),

  /** `null`/omitted → use the tenant's default currency. */
  currency: z.enum(CLIENT_CURRENCIES).nullable().optional(),

  notes: optionalText(2000),
});
export type ClientInput = z.infer<typeof clientInputSchema>;

/**
 * What `GET /clients/:id` returns and what create / update echo back. Optional text
 * fields are always an explicit `string | null`, never `undefined`; timestamps are
 * ISO strings.
 */
export const clientResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  taxId: z.string().nullable(),
  addressMode: z.enum(CLIENT_ADDRESS_MODES),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  addressText: z.string().nullable(),
  currency: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClientResponse = z.infer<typeof clientResponseSchema>;

/**
 * Query string for `GET /clients` (backlog 2.1.2). `search` matches name / email /
 * tax ID, case-insensitively; `sort` and the page numbers have defaults so a bare
 * `GET /clients` is valid.
 */
export const clientListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  sort: z.enum(CLIENT_SORT_VALUES).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(CLIENT_PAGE_SIZE_MAX).default(CLIENT_PAGE_SIZE),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

/** One page of clients. `totalPages` is `ceil(total / pageSize)`, at least 1. */
export const clientListResponseSchema = z.object({
  items: z.array(clientResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
