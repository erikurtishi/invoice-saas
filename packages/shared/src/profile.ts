import { z } from 'zod';

import { optionalText } from './text.js';

/**
 * Business-profile payload shapes (backlog Epic 1.2). Imported by `apps/api` for
 * request validation and by `apps/web` for the settings / onboarding form
 * resolvers, so the profile form and the `PATCH /profile` endpoint can never
 * disagree on a field.
 *
 * The profile lives on the `users` row (decision D3 — the user *is* the tenant), so
 * these describe a slice of that row, not a separate entity.
 */

/** Paper sizes the renderer supports (spec §4, mirrors the Prisma `PaperSize` enum). */
export const PAPER_SIZES = ['A4', 'LETTER', 'LEGAL', 'A5'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/** UI + invoice languages (mirrors the Prisma `Language` enum). */
export const PROFILE_LANGUAGES = ['EN', 'SQ', 'MK'] as const;
export type ProfileLanguage = (typeof PROFILE_LANGUAGES)[number];

/**
 * Native language names, for the settings selects and the in-app language switcher
 * (Epic X.1.4). Endonyms on purpose — a Macedonian speaker looks for "Македонски",
 * not "Macedonian". The English label stays plain "English".
 */
export const LANGUAGE_ENDONYMS: Record<ProfileLanguage, string> = {
  EN: 'English',
  SQ: 'Shqip',
  MK: 'Македонски',
};

/**
 * Default-currency choices offered in the profile form. Curated rather than "any
 * ISO 4217 string": these cover the target markets (MK/AL/XK + US) plus the common
 * international ones. Per-invoice currency (4.2.7) is a separate, wider setting.
 */
export const PROFILE_CURRENCIES = ['EUR', 'USD', 'MKD', 'ALL', 'RSD', 'GBP', 'CHF'] as const;
export type ProfileCurrency = (typeof PROFILE_CURRENCIES)[number];

/** Max net payment term the form accepts, in days. */
export const PAYMENT_TERMS_MAX_DAYS = 365;

/**
 * Address lines, country, tax ID etc. are stored as plain strings — never parsed or
 * format-validated (formats vary by country; see the schema comment on `taxId`).
 * The `optionalText` builder they use lives in `./text.ts`, shared with the client
 * schema.
 */

/**
 * The editable business profile (backlog 1.2.2). The settings form and the
 * onboarding wizard both submit this whole object; the API replaces the stored
 * values with it wholesale (a PATCH in verb only — there are no partial updates,
 * which keeps "cleared a field" unambiguous).
 */
export const businessProfileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'Enter your business name.')
    .max(200, 'Business name is too long.'),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  postalCode: optionalText(32),
  /** Free text — printed on the invoice as entered. Not an ISO country code. */
  country: optionalText(60),
  /** VAT / tax registration number. Plain string, format varies by country. */
  taxId: optionalText(64),
  defaultCurrency: z.enum(PROFILE_CURRENCIES, {
    message: 'Choose a default currency.',
  }),
  defaultPaymentTermsDays: z.coerce
    .number({ message: 'Enter a number of days.' })
    .int('Enter a whole number of days.')
    .min(0, 'Payment terms cannot be negative.')
    .max(PAYMENT_TERMS_MAX_DAYS, `Use ${PAYMENT_TERMS_MAX_DAYS} days or fewer.`),
  defaultPaperSize: z.enum(PAPER_SIZES, { message: 'Choose a default paper size.' }),
  /** Language of the app UI itself (X.1.4) — drives react-i18next. Independent of
   * `invoiceLanguage`: a Macedonian-market business may run the app in Albanian. */
  uiLanguage: z.enum(PROFILE_LANGUAGES, { message: 'Choose a language.' }),
  /** Language of the *printed invoice* labels (spec §10, X.1.3). Seeds the invoice
   * form's per-document `language` field; never touches the app UI. */
  invoiceLanguage: z.enum(PROFILE_LANGUAGES, { message: 'Choose a language.' }),
});
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

/**
 * What `GET /profile` returns and what `PATCH /profile` / the logo endpoints echo
 * back. Same fields as the input plus the server-owned `logoUrl`; optional text
 * fields are always an explicit `string | null`, never `undefined`.
 */
export const businessProfileResponseSchema = z.object({
  businessName: z.string(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  taxId: z.string().nullable(),
  defaultCurrency: z.string(),
  defaultPaymentTermsDays: z.number().int(),
  defaultPaperSize: z.enum(PAPER_SIZES),
  uiLanguage: z.enum(PROFILE_LANGUAGES),
  invoiceLanguage: z.enum(PROFILE_LANGUAGES),
  /** Root-relative path (`/uploads/logos/…`); the web app resolves it against the
   * API origin. `null` until a logo is uploaded (1.2.3). */
  logoUrl: z.string().nullable(),
});
export type BusinessProfileResponse = z.infer<typeof businessProfileResponseSchema>;

// --- Logo upload (backlog 1.2.3) --------------------------------------------

/** Upload ceiling. Enforced by multer at the edge and re-checked in the service. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Accepted source formats. SVG is deliberately excluded (script/XXE surface); the
 * server re-encodes everything to a normalised raster anyway. */
export const LOGO_ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** `accept` attribute for the file input, kept in sync with the MIME allow-list. */
export const LOGO_ACCEPT_ATTR = LOGO_ACCEPTED_MIME.join(',');

/** Longest edge of the stored logo, in pixels — the service downscales to fit. */
export const LOGO_MAX_DIMENSION = 512;

// --- Account deletion (backlog X.4.4) -------------------------------------

/**
 * Body for `DELETE /profile` — the tenant closing their own account. Both fields
 * are a deliberate friction step in front of an irreversible cascade delete: the
 * current password re-authenticates the session, and `confirmEmail` must match
 * the account email (checked case-insensitively server-side) so a mistyped or
 * borrowed session can't trigger it by accident.
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm.'),
  confirmEmail: z.string().min(1, 'Type your account email to confirm.'),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
