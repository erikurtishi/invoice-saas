import { z } from 'zod';

import { AI_GENERATION_STATUSES } from './ai.js';
import { entitlementsSchema, USER_TIERS } from './billing.js';

/**
 * Admin-center shapes (backlog Phase 8). Today this is only the **audit log**
 * (Epic 8.1.2 — "who granted what, when"): the wire shape `apps/api` returns and
 * `apps/web`'s admin center will render.
 *
 * The log is **append-only** — `apps/api/src/services/admin-audit-service.ts` is
 * the single writer and exposes no update or delete. Rows are cross-tenant (an
 * admin acts *on* tenants, not *as* one), so unlike every domain model there is
 * no `tenantId`: the affected tenant is `targetTenantId`, with an email snapshot
 * that stays readable after that tenant is deleted.
 */

/**
 * Known `action` slugs. A dotted `subject.verb` string, not a Zod enum on the
 * wire — new admin epics append values (`account.disable`, `tenant.delete`, …)
 * without a shared-package change forcing a redeploy of both apps in lockstep.
 * This list is the source of truth for the labels the admin UI shows.
 */
export const ADMIN_AUDIT_ACTIONS = {
  'grant.create': 'Issued a manual subscription grant',
  'grant.update': 'Modified a manual subscription grant',
  'grant.revoke': 'Revoked a manual subscription grant',
  'account.disable': 'Disabled a tenant account',
  'account.enable': 'Re-enabled a tenant account',
  'tenant.delete': 'Deleted a tenant and all its data',
  'support.ticket.open': 'Opened a support ticket',
  'support.ticket.close': 'Closed a support ticket',
  'support.ticket.reopen': 'Reopened a support ticket',
} as const;
export type AdminAuditAction = keyof typeof ADMIN_AUDIT_ACTIONS;

/** Human label for an `action` slug; falls back to the raw slug if unknown. */
export function adminAuditActionLabel(action: string): string {
  return (ADMIN_AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

/**
 * The `metadata` bag. Every key is optional; which are present depends on
 * `action`. `.strict()` so a typo in a call site fails at write time rather than
 * being persisted silently — the writer is always our own code.
 *
 *  - `grant.create`    → `tier`, `startDate`, `endDate`, `note`
 *  - `grant.update`    → `changes` (per-field `{ from, to }`)
 *  - `grant.revoke`    → `tier`, `endedAt`
 *  - `account.disable`      → `reason`
 *  - `account.enable`       → `{}`
 *  - `tenant.delete`        → `businessName`, `deletedCounts` (rows removed, by kind)
 *  - `support.ticket.*`     → `ticketSubject`, `ticketStatus`
 */
export const adminAuditMetadataSchema = z
  .object({
    tier: z.enum(['BASIC', 'PREMIUM']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    endedAt: z.string().optional(),
    note: z.string().nullable().optional(),
    /** `account.disable` — the free-text support reason, if one was given. */
    reason: z.string().nullable().optional(),
    /** `tenant.delete` — the deleted tenant's business name, for the trail. */
    businessName: z.string().optional(),
    /** `tenant.delete` — count of rows removed, keyed by kind. */
    deletedCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
    /** `support.ticket.*` — the ticket's subject and the status after the action. */
    ticketSubject: z.string().optional(),
    ticketStatus: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional(),
    /** `grant.update` — only the fields that actually changed, old → new. */
    changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })).optional(),
  })
  .strict();
export type AdminAuditMetadata = z.infer<typeof adminAuditMetadataSchema>;

/** One entry in the admin audit log. What the read endpoint returns. */
export const adminAuditLogEntrySchema = z.object({
  id: z.string(),
  /** The admin who acted; both null for a CLI-issued action with no `--by`. */
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  /** The tenant the action affected, if any. */
  targetTenantId: z.string().nullable(),
  targetTenantEmail: z.string().nullable(),
  /** The record acted on, e.g. `"Subscription"` + the grant id. */
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  /** Rendered one-line description. */
  summary: z.string(),
  metadata: adminAuditMetadataSchema,
  /** ISO 8601. */
  createdAt: z.string(),
});
export type AdminAuditLogEntry = z.infer<typeof adminAuditLogEntrySchema>;

export const ADMIN_AUDIT_PAGE_SIZE = 30;
export const ADMIN_AUDIT_PAGE_SIZE_MAX = 100;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

/**
 * Query string for `GET /admin/audit-log` — newest first, filterable by actor,
 * affected tenant, action slug and an inclusive UTC date range. A bare request
 * returns the first page across everything.
 */
export const adminAuditLogQuerySchema = z.object({
  actorUserId: z.string().trim().min(1).optional(),
  targetTenantId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_AUDIT_PAGE_SIZE_MAX)
    .default(ADMIN_AUDIT_PAGE_SIZE),
});
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;

export const adminAuditLogResponseSchema = z.object({
  items: z.array(adminAuditLogEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type AdminAuditLogResponse = z.infer<typeof adminAuditLogResponseSchema>;

// --- Overview dashboard (backlog Epic 8.2, spec §12) --------------------

/**
 * `GET /admin/overview` — the headline numbers for the admin overview. Computed
 * live from `User` + `Subscription` rows by `admin-overview-service.ts`; nothing
 * is snapshotted, so every field is "as of `generatedAt`".
 *
 * Money is integer minor units and rates are basis points (decision D17 / the
 * money-is-integers rule) — the web divides for display, never the API.
 *
 * **MRR is Stripe recurring only.** Manual (cash) grants are fixed-window, not
 * recurring revenue, so they are excluded from `mrr` — but they *are* counted in
 * `activeSubscriptions` (which is about who has access, not who pays monthly).
 */
export const adminOverviewSchema = z.object({
  /** ISO 8601 — the instant every figure below was computed at. */
  generatedAt: z.string(),

  mrr: z.object({
    /** Sum of active Stripe subs' monthly plan price, in minor units. */
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    byTier: z.object({
      BASIC: z.number().int().nonnegative(),
      PREMIUM: z.number().int().nonnegative(),
    }),
    /** Portion of `totalMinor` from subs Stripe is retrying payment on
     *  (`PAST_DUE`) — still counted, but at risk. */
    atRiskMinor: z.number().int().nonnegative(),
  }),

  /**
   * Live subscriptions right now — any `Subscription` row that is `ACTIVE` or
   * `PAST_DUE` and inside its `[startDate, endDate)` window, both sources.
   */
  activeSubscriptions: z.object({
    total: z.number().int().nonnegative(),
    byTier: z.object({
      BASIC: z.number().int().nonnegative(),
      PREMIUM: z.number().int().nonnegative(),
    }),
    bySource: z.object({
      stripe: z.number().int().nonnegative(),
      manual: z.number().int().nonnegative(),
    }),
  }),

  /** New tenant rows by `createdAt`, UTC. `today` = since 00:00Z. */
  signups: z.object({
    today: z.number().int().nonnegative(),
    last7Days: z.number().int().nonnegative(),
    last30Days: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),

  /**
   * Subscriptions whose window closed during the current UTC calendar month
   * (`endDate` in `[monthStart, now]`), any status/source. `rateBps` is
   * `churned / (activeNow + churned)` — an approximation (we don't retain a
   * start-of-month active count), documented for the UI.
   */
  churn: z.object({
    thisMonth: z.number().int().nonnegative(),
    rateBps: z.number().int().nonnegative(),
  }),

  /**
   * Share of tenants that ever held any `Subscription` row (any status or
   * source) — a lifetime Free→paid conversion, not a windowed cohort rate.
   */
  conversion: z.object({
    paidTenants: z.number().int().nonnegative(),
    totalTenants: z.number().int().nonnegative(),
    rateBps: z.number().int().nonnegative(),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// --- Time series for the charts (backlog 8.2.2) ------------------------

export const adminSignupsSeriesQuerySchema = z.object({
  /** Trailing window length in whole UTC days, most recent day inclusive. */
  days: z.coerce.number().int().min(1).max(365).default(90),
});
export type AdminSignupsSeriesQuery = z.infer<typeof adminSignupsSeriesQuerySchema>;

/** `GET /admin/overview/signups` — one bucket per day, zero-filled, oldest first. */
export const adminSignupsSeriesSchema = z.object({
  from: isoDate,
  to: isoDate,
  points: z.array(
    z.object({
      /** `YYYY-MM-DD`, UTC. */
      date: isoDate,
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type AdminSignupsSeries = z.infer<typeof adminSignupsSeriesSchema>;

export const adminRevenueSeriesQuerySchema = z.object({
  /** Trailing window length in whole calendar months, current month inclusive. */
  months: z.coerce.number().int().min(1).max(36).default(12),
});
export type AdminRevenueSeriesQuery = z.infer<typeof adminRevenueSeriesQuerySchema>;

/**
 * `GET /admin/overview/revenue` — MRR at the end of each month in the window
 * (for the current month, as of now), oldest first.
 *
 * `reconstructed: true` is a permanent flag: this series is rebuilt from the
 * current Stripe `Subscription` rows' `startDate` / `endDate` and their *current*
 * tier. It does not know about past plan changes, refunds, or proration, so it is
 * an estimate of history, not a ledger. The UI should label it as such.
 */
export const adminRevenueSeriesSchema = z.object({
  currency: z.string(),
  reconstructed: z.literal(true),
  points: z.array(
    z.object({
      /** `YYYY-MM`, UTC. */
      month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a YYYY-MM month.'),
      mrrMinor: z.number().int().nonnegative(),
    }),
  ),
});
export type AdminRevenueSeries = z.infer<typeof adminRevenueSeriesSchema>;

// --- Tenant management (backlog Epic 8.3, spec §12) --------------------

/** Where a tenant's current access comes from — the source of the highest live
 *  `Subscription` row, or `none` when they are on Free. */
export const TENANT_ACCESS_SOURCES = ['none', 'stripe', 'manual'] as const;
export type TenantAccessSource = (typeof TENANT_ACCESS_SOURCES)[number];

export const ADMIN_TENANT_PAGE_SIZE = 30;
export const ADMIN_TENANT_PAGE_SIZE_MAX = 100;

/**
 * Query string for `GET /admin/tenants` (8.3.1). Free-text `q` matches email or
 * business name (case-insensitive, contains). Sorts are limited to real `User`
 * columns so pagination stays correct — sorting by the computed columns
 * (invoices, last active) is a UI-era refinement.
 */
export const adminTenantListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  tier: z.enum(USER_TIERS).optional(),
  source: z.enum(TENANT_ACCESS_SOURCES).optional(),
  /** `active` = not disabled; `disabled` = `disabledAt` set. */
  status: z.enum(['active', 'disabled']).optional(),
  sort: z.enum(['newest', 'oldest', 'email']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_TENANT_PAGE_SIZE_MAX)
    .default(ADMIN_TENANT_PAGE_SIZE),
});
export type AdminTenantListQuery = z.infer<typeof adminTenantListQuerySchema>;

/** One row of the tenant list. `effectiveTier` / `accessSource` are resolved from
 *  live `Subscription` rows, not the `users.tier` cache. */
export const adminTenantListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  businessName: z.string(),
  /** ISO 8601 — signup date. */
  createdAt: z.string(),
  effectiveTier: z.enum(USER_TIERS),
  accessSource: z.enum(TENANT_ACCESS_SOURCES),
  /** `UsageCounter.lifetimeInvoicesGenerated` — finalized invoices, all time. */
  invoicesCreated: z.number().int().nonnegative(),
  /** ISO 8601 of the most recent invoice history event, or `null` if none.
   *  A proxy for "last active" — there is no session-level activity log. */
  lastActiveAt: z.string().nullable(),
  emailVerified: z.boolean(),
  /** ISO 8601 when the account was disabled, or `null` when active. */
  disabledAt: z.string().nullable(),
});
export type AdminTenantListItem = z.infer<typeof adminTenantListItemSchema>;

export const adminTenantListResponseSchema = z.object({
  items: z.array(adminTenantListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type AdminTenantListResponse = z.infer<typeof adminTenantListResponseSchema>;

/** One subscription row in a tenant's history (8.3.2) — every row, both sources,
 *  newest first. A superset of `ManualGrant` plus the Stripe linkage fields. */
export const adminSubscriptionHistoryItemSchema = z.object({
  id: z.string(),
  tier: z.enum(['BASIC', 'PREMIUM']),
  status: z.enum(['ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED']),
  source: z.enum(['STRIPE', 'MANUAL']),
  startDate: z.string(),
  endDate: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  stripeSubscriptionId: z.string().nullable(),
  /** Manual grants only. */
  note: z.string().nullable(),
  grantedByUserId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminSubscriptionHistoryItem = z.infer<typeof adminSubscriptionHistoryItemSchema>;

/**
 * `GET /admin/tenants/:id` (8.3.2) — the support view of one tenant. Usage
 * summary + subscription history + recent activity, all read-only. Deep browsing
 * of the tenant's own clients/invoices is left to the admin UI.
 */
export const adminTenantDetailSchema = z.object({
  id: z.string(),
  email: z.string(),
  businessName: z.string(),
  country: z.string().nullable(),
  uiLanguage: z.enum(['EN', 'SQ', 'MK']),
  invoiceLanguage: z.enum(['EN', 'SQ', 'MK']),
  defaultCurrency: z.string(),
  createdAt: z.string(),
  emailVerified: z.boolean(),
  onboardingCompleted: z.boolean(),
  role: z.enum(['OWNER', 'ADMIN']),
  disabledAt: z.string().nullable(),
  disabledReason: z.string().nullable(),

  /** The live entitlement resolution — same shape the tenant sees at
   *  `GET /billing/entitlements`. */
  entitlements: entitlementsSchema,

  usage: z.object({
    lifetimeInvoicesGenerated: z.number().int().nonnegative(),
    aiGenerationsInPeriod: z.number().int().nonnegative(),
    aiPeriodKey: z.string(),
    clients: z.number().int().nonnegative(),
    products: z.number().int().nonnegative(),
    templates: z.number().int().nonnegative(),
    invoicesDraft: z.number().int().nonnegative(),
    invoicesIssued: z.number().int().nonnegative(),
    aiGenerations: z.number().int().nonnegative(),
    /** Sum of `AiGenerationLog.costMicros` — USD millionths, integer (D17). */
    aiCostMicros: z.number().int().nonnegative(),
  }),

  subscriptionHistory: z.array(adminSubscriptionHistoryItemSchema),

  /** The last few invoice history events across all the tenant's invoices. */
  recentActivity: z.array(
    z.object({
      id: z.string(),
      invoiceId: z.string(),
      eventType: z.enum([
        'CREATED',
        'EDITED',
        'DOWNLOADED',
        'SENT',
        'DUPLICATED_FROM',
        'DUPLICATED_INTO',
      ]),
      timestamp: z.string(),
    }),
  ),
});
export type AdminTenantDetail = z.infer<typeof adminTenantDetailSchema>;

export const DISABLE_REASON_MAX = 500;

/** Body of `POST /admin/tenants/:id/disable` (8.3.4). */
export const adminDisableTenantSchema = z.object({
  reason: z.string().trim().max(DISABLE_REASON_MAX).optional(),
});
export type AdminDisableTenant = z.infer<typeof adminDisableTenantSchema>;

/** Response of `DELETE /admin/tenants/:id` (8.3.5) — what was removed. */
export const adminDeleteTenantResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  deletedCounts: z.record(z.string(), z.number().int().nonnegative()),
});
export type AdminDeleteTenantResponse = z.infer<typeof adminDeleteTenantResponseSchema>;

// --- Cost & usage monitoring (backlog Epic 8.4, spec §12) --------------

/** Shared query for the windowed usage endpoints. `days` bounds the trailing
 *  window; `limit` caps the per-tenant breakdown (ranked, not paginated). */
export const adminUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminUsageQuery = z.infer<typeof adminUsageQuerySchema>;

/**
 * `GET /admin/usage/ai` (8.4.1) — AI generations consumed vs. limits, per tenant
 * and in aggregate, with estimated cost. `costMicros` is USD millionths (integer,
 * D17); the UI divides for display. `windowDays` echoes the query.
 *
 * `perTenant` is the top `limit` tenants by spend in the window. `currentPeriod*`
 * is the live monthly counter (`UsageCounter`), independent of `windowDays`:
 * `used` is 0 when the tenant's `periodKey` is not the current month.
 */
export const adminAiUsageSchema = z.object({
  windowDays: z.number().int(),
  totals: z.object({
    generations: z.number().int().nonnegative(),
    /** Only `SUCCESS` rows — the ones that counted against a tenant's cap. */
    successGenerations: z.number().int().nonnegative(),
    byStatus: z.record(z.enum(AI_GENERATION_STATUSES), z.number().int().nonnegative()),
    costMicros: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  /** Live monthly consumption across every tenant whose counter is in the
   *  current month, vs the per-tenant Premium cap. */
  currentPeriod: z.object({
    periodKey: z.string(),
    generationsUsed: z.number().int().nonnegative(),
    perTenantLimit: z.number().int().nonnegative(),
  }),
  perTenant: z.array(
    z.object({
      tenantId: z.string(),
      email: z.string(),
      generations: z.number().int().nonnegative(),
      successGenerations: z.number().int().nonnegative(),
      costMicros: z.number().int().nonnegative(),
      /** This tenant's current-month counter (0 if `periodKey` is stale). */
      currentPeriodUsed: z.number().int().nonnegative(),
      periodLimit: z.number().int().nonnegative(),
    }),
  ),
});
export type AdminAiUsage = z.infer<typeof adminAiUsageSchema>;

/**
 * `GET /admin/usage/email` (8.4.2) — email send volume, from `SENT` invoice
 * history events (one row per successful send). Daily buckets are zero-filled,
 * oldest first.
 */
export const adminEmailUsageSchema = z.object({
  windowDays: z.number().int(),
  totalSends: z.number().int().nonnegative(),
  daily: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.'),
      sends: z.number().int().nonnegative(),
    }),
  ),
  perTenant: z.array(
    z.object({
      tenantId: z.string(),
      email: z.string(),
      sends: z.number().int().nonnegative(),
    }),
  ),
});
export type AdminEmailUsage = z.infer<typeof adminEmailUsageSchema>;

/**
 * `GET /admin/usage/storage` (8.4.3) — stored-asset footprint. Only logos are
 * persisted; generated PDFs are streamed, never written, so `pdfBytes` is always
 * 0 (kept in the shape so the UI can say so explicitly).
 */
export const adminStorageUsageSchema = z.object({
  logoCount: z.number().int().nonnegative(),
  logoBytes: z.number().int().nonnegative(),
  pdfBytes: z.literal(0),
  perTenant: z.array(
    z.object({
      tenantId: z.string(),
      email: z.string(),
      /** `null` when the DB has a `logoUrl` but the file is missing on disk. */
      bytes: z.number().int().nonnegative().nullable(),
    }),
  ),
});
export type AdminStorageUsage = z.infer<typeof adminStorageUsageSchema>;

/** Basis-point ratio of last-24h volume to the trailing daily average above
 *  which `getUsageAnomalies` flags a spike (3×). */
export const USAGE_SPIKE_RATIO_BPS = 30_000;

/**
 * `GET /admin/usage/anomalies` (8.4.4) — a cheap spike signal for AI spend and
 * email volume: last 24h vs the mean of the preceding 7 days. `flagged` is set
 * when `ratioBps >= USAGE_SPIKE_RATIO_BPS` (or there is fresh volume against a
 * zero baseline). This only *surfaces* anomalies — routing them to email/Slack
 * is deferred.
 */
const anomalySignalSchema = z.object({
  last24h: z.number().nonnegative(),
  baselineDailyAvg: z.number().nonnegative(),
  /** `last24h / baselineDailyAvg` in basis points; `null` when the baseline is 0. */
  ratioBps: z.number().int().nonnegative().nullable(),
  flagged: z.boolean(),
});
export const adminUsageAnomaliesSchema = z.object({
  generatedAt: z.string(),
  thresholdBps: z.number().int(),
  /** AI cost, in USD micros. */
  aiCostMicros: anomalySignalSchema,
  /** Email sends, count. */
  emailSends: anomalySignalSchema,
});
export type AdminUsageAnomalies = z.infer<typeof adminUsageAnomaliesSchema>;

// --- Billing view (backlog Epic 8.5, spec §12) ------------------------

/**
 * One subscription row for the admin billing view — Stripe *or* manual, always
 * `source`-labelled (8.5.2). `effectiveEnd` is `endDate ?? currentPeriodEnd`;
 * `daysUntilEnd` is whole days from now (negative once it has lapsed, `null`
 * when there is no end at all — an open-ended live Stripe sub).
 *
 * We store subscription-level state only: individual failed-payment invoices
 * live in the Stripe dashboard, not here. A `PAST_DUE` status is Stripe's
 * dunning state — that is what `failedPayments` keys off.
 */
export const adminBillingSubscriptionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  tenantEmail: z.string(),
  tenantBusinessName: z.string(),
  source: z.enum(['STRIPE', 'MANUAL']),
  tier: z.enum(['BASIC', 'PREMIUM']),
  status: z.enum(['ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED']),
  startDate: z.string(),
  endDate: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  stripeSubscriptionId: z.string().nullable(),
  stripePriceId: z.string().nullable(),
  /** Manual grants only. */
  note: z.string().nullable(),
  grantedByUserId: z.string().nullable(),
  createdAt: z.string(),
  effectiveEnd: z.string().nullable(),
  daysUntilEnd: z.number().int().nullable(),
});
export type AdminBillingSubscription = z.infer<typeof adminBillingSubscriptionSchema>;

export const ADMIN_BILLING_PAGE_SIZE = 30;
export const ADMIN_BILLING_PAGE_SIZE_MAX = 100;

/** `GET /admin/billing/subscriptions` (8.5.1 + 8.5.2). */
export const adminBillingListQuerySchema = z.object({
  source: z.enum(['all', 'stripe', 'manual']).default('all'),
  status: z.enum(['ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED']).optional(),
  /** `newest` = by `createdAt` desc; `expiry` = by `effectiveEnd` asc, no-end last. */
  sort: z.enum(['newest', 'expiry']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_BILLING_PAGE_SIZE_MAX)
    .default(ADMIN_BILLING_PAGE_SIZE),
});
export type AdminBillingListQuery = z.infer<typeof adminBillingListQuerySchema>;

export const adminBillingListResponseSchema = z.object({
  items: z.array(adminBillingSubscriptionSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  /** Computed over the whole `source`-filtered set, ignoring `status` + paging —
   *  a stable header for the view. */
  summary: z.object({
    total: z.number().int().nonnegative(),
    byStatus: z.object({
      ACTIVE: z.number().int().nonnegative(),
      PAST_DUE: z.number().int().nonnegative(),
      EXPIRED: z.number().int().nonnegative(),
      CANCELED: z.number().int().nonnegative(),
    }),
    bySource: z.object({
      stripe: z.number().int().nonnegative(),
      manual: z.number().int().nonnegative(),
    }),
    cancelingAtPeriodEnd: z.number().int().nonnegative(),
  }),
});
export type AdminBillingListResponse = z.infer<typeof adminBillingListResponseSchema>;

export const adminBillingAttentionQuerySchema = z.object({
  /** Renewals with `currentPeriodEnd` within this many days are "upcoming". */
  renewalWindowDays: z.coerce.number().int().min(1).max(180).default(30),
});
export type AdminBillingAttentionQuery = z.infer<typeof adminBillingAttentionQuerySchema>;

/**
 * `GET /admin/billing/attention` (8.5.1) — the two Stripe slices that need an
 * eye: subs in dunning, and subs renewing soon (active, not set to cancel).
 * Both full lists — small, not paginated.
 */
export const adminBillingAttentionSchema = z.object({
  generatedAt: z.string(),
  renewalWindowDays: z.number().int(),
  failedPayments: z.array(adminBillingSubscriptionSchema),
  upcomingRenewals: z.array(adminBillingSubscriptionSchema),
});
export type AdminBillingAttention = z.infer<typeof adminBillingAttentionSchema>;

// --- Support inbox (backlog Epic 8.6, spec §12) ----------------------

export const SUPPORT_TICKET_STATUSES = ['OPEN', 'PENDING', 'CLOSED'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

/** `TENANT` = an admin logging what the tenant said (email/call); there is no
 *  tenant-facing support flow. */
export const SUPPORT_MESSAGE_AUTHORS = ['ADMIN', 'TENANT'] as const;
export type SupportMessageAuthor = (typeof SUPPORT_MESSAGE_AUTHORS)[number];

export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_BODY_MAX = 10_000;
export const ADMIN_SUPPORT_PAGE_SIZE = 30;
export const ADMIN_SUPPORT_PAGE_SIZE_MAX = 100;

/** `POST /admin/support/tickets` — open a case. The tenant link is best-effort:
 *  an address that matches no account still opens a ticket (`tenantId` null). */
export const supportTicketCreateSchema = z.object({
  tenantEmail: z
    .string()
    .trim()
    .min(1)
    .email()
    .transform((v) => v.toLowerCase()),
  subject: z.string().trim().min(1).max(SUPPORT_SUBJECT_MAX),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).default('NORMAL'),
  /** The opening message. */
  body: z.string().trim().min(1).max(SUPPORT_BODY_MAX),
});
export type SupportTicketCreate = z.infer<typeof supportTicketCreateSchema>;

/** `PATCH /admin/support/tickets/:id` — at least one field. `assigneeEmail: null`
 *  clears the assignee; a non-null value must be an existing admin. */
export const supportTicketUpdateSchema = z
  .object({
    subject: z.string().trim().min(1).max(SUPPORT_SUBJECT_MAX).optional(),
    status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
    priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
    assigneeEmail: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.subject !== undefined ||
      v.status !== undefined ||
      v.priority !== undefined ||
      v.assigneeEmail !== undefined,
    { message: 'Provide at least one field to change.' },
  );
export type SupportTicketUpdate = z.infer<typeof supportTicketUpdateSchema>;

/** `POST /admin/support/tickets/:id/messages` — append to the thread. */
export const supportMessageCreateSchema = z.object({
  author: z.enum(SUPPORT_MESSAGE_AUTHORS),
  body: z.string().trim().min(1).max(SUPPORT_BODY_MAX),
});
export type SupportMessageCreate = z.infer<typeof supportMessageCreateSchema>;

export const supportMessageSchema = z.object({
  id: z.string(),
  author: z.enum(SUPPORT_MESSAGE_AUTHORS),
  authorUserId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
});
export type SupportMessage = z.infer<typeof supportMessageSchema>;

/** A ticket without its thread — one row of the inbox list. */
export const supportTicketSummarySchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  tenantEmail: z.string().nullable(),
  subject: z.string(),
  status: z.enum(SUPPORT_TICKET_STATUSES),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
  openedByUserId: z.string().nullable(),
  assigneeUserId: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
});
export type SupportTicketSummary = z.infer<typeof supportTicketSummarySchema>;

/** A ticket with its full message thread (oldest first). */
export const supportTicketDetailSchema = supportTicketSummarySchema.extend({
  messages: z.array(supportMessageSchema),
});
export type SupportTicketDetail = z.infer<typeof supportTicketDetailSchema>;

export const adminSupportListQuerySchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
  tenantId: z.string().trim().min(1).optional(),
  assigneeUserId: z.string().trim().min(1).optional(),
  /** Matches the subject (case-insensitive, contains). */
  q: z.string().trim().min(1).max(200).optional(),
  /** `newest` / `oldest` by `createdAt`; `updated` by `updatedAt` desc. */
  sort: z.enum(['newest', 'oldest', 'updated']).default('updated'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_SUPPORT_PAGE_SIZE_MAX)
    .default(ADMIN_SUPPORT_PAGE_SIZE),
});
export type AdminSupportListQuery = z.infer<typeof adminSupportListQuerySchema>;

export const adminSupportListResponseSchema = z.object({
  items: z.array(supportTicketSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  /** Open + pending counts for the inbox header, over all tickets. */
  openCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
});
export type AdminSupportListResponse = z.infer<typeof adminSupportListResponseSchema>;
