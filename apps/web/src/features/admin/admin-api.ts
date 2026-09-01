import type {
  AdminAiUsage,
  AdminAuditLogQuery,
  AdminAuditLogResponse,
  AdminBillingAttention,
  AdminBillingListQuery,
  AdminBillingListResponse,
  AdminDeleteTenantResponse,
  AdminEmailUsage,
  AdminOverview,
  AdminRevenueSeries,
  AdminSignupsSeries,
  AdminStorageUsage,
  AdminSupportListQuery,
  AdminSupportListResponse,
  AdminTenantDetail,
  AdminTenantListQuery,
  AdminTenantListResponse,
  AdminUsageAnomalies,
  ManualGrant,
  ManualGrantCreate,
  ManualGrantUpdate,
  SupportMessageCreate,
  SupportTicketCreate,
  SupportTicketDetail,
  SupportTicketUpdate,
  TenantGrants,
} from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin, typed wrappers over every `/admin/*` endpoint (backlog Phase L2 / the
 * already-complete Phase 8 backend). One function per endpoint, no `any` — the
 * wire shapes all come from `@invoice-saas/shared` `admin.ts` / `billing.ts`
 * (`L2.1.2`). TanStack Query wiring lives in `use-admin.ts`.
 *
 * The admin API is cross-tenant: these calls carry the same bearer token as the
 * rest of the app and the server gates them with `authenticate` + `requireAdmin`
 * (role re-read per call).
 */

// --- query-string helpers ------------------------------------------------

/** Only the params the caller actually set — keeps query keys and URLs stable. */
export type AdminTenantListParams = Partial<
  Pick<AdminTenantListQuery, 'q' | 'tier' | 'source' | 'status' | 'sort' | 'page' | 'pageSize'>
>;
export type AdminAuditLogParams = Partial<
  Pick<
    AdminAuditLogQuery,
    'actorUserId' | 'targetTenantId' | 'action' | 'dateFrom' | 'dateTo' | 'page' | 'pageSize'
  >
>;
export type AdminBillingListParams = Partial<
  Pick<AdminBillingListQuery, 'source' | 'status' | 'sort' | 'page' | 'pageSize'>
>;
export type AdminSupportListParams = Partial<
  Pick<
    AdminSupportListQuery,
    'status' | 'priority' | 'tenantId' | 'assigneeUserId' | 'q' | 'sort' | 'page' | 'pageSize'
  >
>;
/** Windowed usage endpoints (`?days=&limit=`). */
export type AdminUsageParams = { days?: number; limit?: number };

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === null) continue;
    // Skip a page=1 so the first page's key matches a bare request.
    if (key === 'page' && value === 1) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// --- overview (Epic L2.2) ---------------------------------------------------

export function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>('/admin/overview');
}

export function fetchAdminSignupsSeries(days: number): Promise<AdminSignupsSeries> {
  return apiFetch<AdminSignupsSeries>(`/admin/overview/signups${qs({ days })}`);
}

export function fetchAdminRevenueSeries(months: number): Promise<AdminRevenueSeries> {
  return apiFetch<AdminRevenueSeries>(`/admin/overview/revenue${qs({ months })}`);
}

// --- tenants (Epic L2.3) -------------------------------------------------

export function fetchAdminTenants(params: AdminTenantListParams): Promise<AdminTenantListResponse> {
  return apiFetch<AdminTenantListResponse>(`/admin/tenants${qs(params)}`);
}

export function fetchAdminTenant(id: string): Promise<AdminTenantDetail> {
  return apiFetch<AdminTenantDetail>(`/admin/tenants/${id}`);
}

export function disableAdminTenant(id: string, reason?: string): Promise<AdminTenantDetail> {
  return apiFetch<AdminTenantDetail>(`/admin/tenants/${id}/disable`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

export function enableAdminTenant(id: string): Promise<AdminTenantDetail> {
  return apiFetch<AdminTenantDetail>(`/admin/tenants/${id}/enable`, { method: 'POST' });
}

export function deleteAdminTenant(id: string): Promise<AdminDeleteTenantResponse> {
  return apiFetch<AdminDeleteTenantResponse>(`/admin/tenants/${id}`, { method: 'DELETE' });
}

// --- audit log (Epic L2.3.5) ------------------------------------------------

export function fetchAdminAuditLog(params: AdminAuditLogParams): Promise<AdminAuditLogResponse> {
  return apiFetch<AdminAuditLogResponse>(`/admin/audit-log${qs(params)}`);
}

// --- manual grants (Epic L2.4) --------------------------------------------

export function fetchTenantGrants(email: string): Promise<TenantGrants> {
  return apiFetch<TenantGrants>(`/admin/grants${qs({ email })}`);
}

export function createGrant(input: ManualGrantCreate): Promise<ManualGrant> {
  return apiFetch<ManualGrant>('/admin/grants', { method: 'POST', body: input });
}

export function updateGrant(id: string, input: ManualGrantUpdate): Promise<ManualGrant> {
  return apiFetch<ManualGrant>(`/admin/grants/${id}`, { method: 'PATCH', body: input });
}

export function revokeGrant(id: string): Promise<ManualGrant> {
  return apiFetch<ManualGrant>(`/admin/grants/${id}`, { method: 'DELETE' });
}

// --- usage (Epic L2.5) --------------------------------------------------

export function fetchAiUsage(params: AdminUsageParams): Promise<AdminAiUsage> {
  return apiFetch<AdminAiUsage>(`/admin/usage/ai${qs(params)}`);
}

export function fetchEmailUsage(params: AdminUsageParams): Promise<AdminEmailUsage> {
  return apiFetch<AdminEmailUsage>(`/admin/usage/email${qs(params)}`);
}

export function fetchStorageUsage(params: AdminUsageParams): Promise<AdminStorageUsage> {
  return apiFetch<AdminStorageUsage>(`/admin/usage/storage${qs(params)}`);
}

export function fetchUsageAnomalies(): Promise<AdminUsageAnomalies> {
  return apiFetch<AdminUsageAnomalies>('/admin/usage/anomalies');
}

// --- billing (Epic L2.6) ----------------------------------------------

export function fetchBillingSubscriptions(
  params: AdminBillingListParams,
): Promise<AdminBillingListResponse> {
  return apiFetch<AdminBillingListResponse>(`/admin/billing/subscriptions${qs(params)}`);
}

export function fetchBillingAttention(renewalWindowDays?: number): Promise<AdminBillingAttention> {
  return apiFetch<AdminBillingAttention>(`/admin/billing/attention${qs({ renewalWindowDays })}`);
}

// --- support inbox (Epic L2.7) --------------------------------------------

export function fetchSupportTickets(
  params: AdminSupportListParams,
): Promise<AdminSupportListResponse> {
  return apiFetch<AdminSupportListResponse>(`/admin/support/tickets${qs(params)}`);
}

export function fetchSupportTicket(id: string): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(`/admin/support/tickets/${id}`);
}

export function createSupportTicket(input: SupportTicketCreate): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>('/admin/support/tickets', {
    method: 'POST',
    body: input,
  });
}

export function updateSupportTicket(
  id: string,
  input: SupportTicketUpdate,
): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(`/admin/support/tickets/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

/** Returns the whole ticket (thread + bumped `updatedAt`), not just the new
 *  message — that's what `addSupportMessage` in the API actually replies with. */
export function addSupportMessage(
  id: string,
  input: SupportMessageCreate,
): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(`/admin/support/tickets/${id}/messages`, {
    method: 'POST',
    body: input,
  });
}
