import { z } from 'zod';

/**
 * Billing / subscription shapes (backlog Epic 6.1, spec §9). Single source of
 * truth for both apps: `apps/api` enforces these numbers server-side in
 * `lib/entitlements.ts` (the one sanctioned tier reader, decision D19), and
 * `apps/web` reads the same catalog to render the pricing table and the
 * settings usage card without re-hardcoding a figure that could drift.
 *
 * Money is integer minor units (CLAUDE.md, decision D17) — prices here are in
 * euro cents.
 */

export const USER_TIERS = ['FREE', 'BASIC', 'PREMIUM'] as const;
export type UserTierName = (typeof USER_TIERS)[number];

/** Access ordering for decision D5 ("most access wins"): higher rank = more access. */
export const TIER_RANK: Record<UserTierName, number> = { FREE: 0, BASIC: 1, PREMIUM: 2 };

/** The higher-access of two tiers (used to resolve overlapping subscriptions). */
export function higherTier(a: UserTierName, b: UserTierName): UserTierName {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

// --- Enforcement constants (spec §9, decision D6) ---------------------------

/** Free tier: one invoice generation, for the lifetime of the account — not
 *  monthly (spec §9, backlog 6.1.5). "Generation" = a finalize/issue. */
export const FREE_INVOICE_LIFETIME_LIMIT = 1;

/** Premium AI drafting cap, per calendar month (decision D6). Phase 7 enforces
 *  it; the counter that backs it is built here in 6.1.3. */
export const PREMIUM_AI_MONTHLY_LIMIT = 50;

// --- Plan catalog (spec §9 comparison table) ------------------------------

export interface PlanEntry {
  tier: UserTierName;
  /** Monthly price in euro cents (integer minor units). */
  priceMinor: number;
  currency: string;
  /** Invoices allowed. Structured, not prose — the web renders the copy. */
  invoices: { kind: 'limited'; lifetimeLimit: number } | { kind: 'unlimited' };
  templates: 'default-only' | 'full-editor';
  ai: boolean;
}

export const PLAN_CATALOG: Record<UserTierName, PlanEntry> = {
  FREE: {
    tier: 'FREE',
    priceMinor: 0,
    currency: 'EUR',
    invoices: { kind: 'limited', lifetimeLimit: FREE_INVOICE_LIFETIME_LIMIT },
    templates: 'default-only',
    ai: false,
  },
  BASIC: {
    tier: 'BASIC',
    priceMinor: 1000,
    currency: 'EUR',
    invoices: { kind: 'unlimited' },
    templates: 'full-editor',
    ai: false,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    priceMinor: 3000,
    currency: 'EUR',
    invoices: { kind: 'unlimited' },
    templates: 'full-editor',
    ai: true,
  },
};

// --- Entitlements payload (GET /billing/entitlements, backlog 6.1.2) --------

/** One metered allowance. `limit: null` + `unlimited: true` = no cap. */
export const allowanceSchema = z.object({
  unlimited: z.boolean(),
  limit: z.number().int().nonnegative().nullable(),
  used: z.number().int().nonnegative(),
  /** `limit - used`, floored at 0; null when unlimited. */
  remaining: z.number().int().nonnegative().nullable(),
});
export type Allowance = z.infer<typeof allowanceSchema>;

/**
 * The single answer to "what can this tenant do right now" (backlog 6.1.2).
 * Resolved server-side from `Subscription` rows + `UsageCounter`; the web treats
 * it as a display/gating hint only — every gated endpoint re-checks (6.1.4).
 */
export const entitlementsSchema = z.object({
  tier: z.enum(USER_TIERS),
  /** Where the tier came from — for the "your plan" copy (spec §9: the user
   *  doesn't need to know a manual grant from a Stripe sub, but we surface an
   *  end date when there is one). */
  source: z.enum(['none', 'stripe', 'manual']),
  /** ISO date the current access ends, when it is time-bounded: a manual grant's
   *  end date, or a Stripe sub scheduled to cancel at period end. */
  accessEndsAt: z.string().datetime().nullable(),
  /** ISO date the Stripe subscription next renews — set only while it is active
   *  and NOT scheduled to cancel. Null for manual grants and Free. */
  renewsAt: z.string().datetime().nullable(),
  /** The active Stripe sub is set to cancel at the end of the current period. */
  cancelAtPeriodEnd: z.boolean(),
  /** The tenant has a Stripe customer, so the Customer Portal can be opened
   *  (6.2.4) — independent of the current tier (a lapsed customer still manages
   *  billing). */
  canManageBilling: z.boolean(),
  canManageTemplates: z.boolean(),
  canUseAi: z.boolean(),
  invoices: allowanceSchema,
  ai: allowanceSchema.extend({
    /** ISO datetime the monthly AI counter next resets; null when AI is off. */
    periodResetsAt: z.string().datetime().nullable(),
  }),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

// --- Checkout / portal (backlog 6.2.2 / 6.2.4) ----------------------------

/** Body of `POST /billing/checkout` — which paid plan to subscribe to. */
export const checkoutRequestSchema = z.object({
  tier: z.enum(['BASIC', 'PREMIUM']),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** Response of `POST /billing/checkout` and `POST /billing/portal` — a Stripe
 *  hosted URL the client redirects the browser to. */
export const billingRedirectSchema = z.object({
  url: z.string().url(),
});
export type BillingRedirect = z.infer<typeof billingRedirectSchema>;

// --- Manual (cash) grants (backlog Epic 6.3, spec §9) ---------------------

/** `YYYY-MM-DD` — a calendar day, not a timestamp. The server anchors the start
 *  to 00:00:00Z of the day and the end to 23:59:59.999Z so the last day is fully
 *  covered. */
export const grantDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const GRANT_NOTE_MAX = 500;

/** `POST /admin/grants` — issue a paid tier to a tenant for a fixed window. */
export const manualGrantCreateSchema = z
  .object({
    /** The tenant owner's exact email (case-insensitive). 404 if unknown. */
    email: z
      .string()
      .trim()
      .min(1)
      .email()
      .transform((v) => v.toLowerCase()),
    tier: z.enum(['BASIC', 'PREMIUM']),
    startDate: grantDateSchema,
    endDate: grantDateSchema,
    note: z.string().trim().max(GRANT_NOTE_MAX).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  });
export type ManualGrantCreate = z.infer<typeof manualGrantCreateSchema>;

/** `PATCH /admin/grants/:id` — extend / shorten / re-note an existing grant
 *  (backlog 6.3.4). At least one field. Revoke is `DELETE`. */
export const manualGrantUpdateSchema = z
  .object({
    startDate: grantDateSchema.optional(),
    endDate: grantDateSchema.optional(),
    note: z.string().trim().max(GRANT_NOTE_MAX).nullable().optional(),
  })
  .refine((v) => v.startDate !== undefined || v.endDate !== undefined || v.note !== undefined, {
    message: 'Provide at least one field to change.',
  });
export type ManualGrantUpdate = z.infer<typeof manualGrantUpdateSchema>;

/** One manual grant as the admin API returns it (backlog 6.3.6). */
export const manualGrantSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  tier: z.enum(['BASIC', 'PREMIUM']),
  /** `ACTIVE` (granting now), `EXPIRED` (past its end date), `CANCELED` (revoked early). */
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELED', 'PAST_DUE']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  note: z.string().nullable(),
  grantedByUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
  /** Whole days from now until `endDate`, floored at 0; `0` once it has lapsed. */
  daysRemaining: z.number().int().nonnegative(),
});
export type ManualGrant = z.infer<typeof manualGrantSchema>;

/** `GET /admin/grants?email=` — a tenant plus every manual grant they hold. */
export const tenantGrantsSchema = z.object({
  tenant: z.object({
    id: z.string(),
    email: z.string(),
    businessName: z.string(),
    /** The tenant's effective tier right now (from the entitlement service). */
    tier: z.enum(USER_TIERS),
  }),
  grants: z.array(manualGrantSchema),
});
export type TenantGrants = z.infer<typeof tenantGrantsSchema>;
