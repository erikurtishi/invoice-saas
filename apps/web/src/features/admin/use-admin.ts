import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminTenantDetail,
  ManualGrantCreate,
  ManualGrantUpdate,
  SupportMessageCreate,
  SupportTicketCreate,
  SupportTicketUpdate,
} from '@invoice-saas/shared';

import {
  type AdminAuditLogParams,
  type AdminBillingListParams,
  type AdminSupportListParams,
  type AdminTenantListParams,
  type AdminUsageParams,
  addSupportMessage,
  createGrant,
  createSupportTicket,
  deleteAdminTenant,
  disableAdminTenant,
  enableAdminTenant,
  fetchAdminAuditLog,
  fetchAdminOverview,
  fetchAdminRevenueSeries,
  fetchAdminSignupsSeries,
  fetchAdminTenant,
  fetchAdminTenants,
  fetchAiUsage,
  fetchBillingAttention,
  fetchBillingSubscriptions,
  fetchEmailUsage,
  fetchStorageUsage,
  fetchSupportTicket,
  fetchSupportTickets,
  fetchTenantGrants,
  fetchUsageAnomalies,
  revokeGrant,
  updateGrant,
  updateSupportTicket,
} from './admin-api';

/**
 * Every `/admin/*` endpoint as a typed TanStack Query hook (backlog `L2.1.2`).
 * Each metric / list / detail is its own query so a widget loads and fails
 * independently behind its own `<QueryBoundary>` (`X.7.20`). Mutations invalidate
 * the lists they touch and write fresh detail responses back into cache.
 *
 * `staleTime` is generous (30–60 s): admin data is monitoring, not a live feed,
 * and the screens are read-heavy.
 */

const ADMIN_STALE = 30 * 1000;

export const adminKeys = {
  all: ['admin'] as const,

  overview: () => [...adminKeys.all, 'overview'] as const,
  signups: (days: number) => [...adminKeys.all, 'overview', 'signups', days] as const,
  revenue: (months: number) => [...adminKeys.all, 'overview', 'revenue', months] as const,

  tenants: () => [...adminKeys.all, 'tenants'] as const,
  tenantList: (params: AdminTenantListParams) => [...adminKeys.tenants(), 'list', params] as const,
  tenantDetail: (id: string) => [...adminKeys.tenants(), 'detail', id] as const,

  auditLog: (params: AdminAuditLogParams) => [...adminKeys.all, 'audit-log', params] as const,

  grants: (email: string) => [...adminKeys.all, 'grants', email] as const,

  usage: () => [...adminKeys.all, 'usage'] as const,
  aiUsage: (params: AdminUsageParams) => [...adminKeys.usage(), 'ai', params] as const,
  emailUsage: (params: AdminUsageParams) => [...adminKeys.usage(), 'email', params] as const,
  storageUsage: (params: AdminUsageParams) => [...adminKeys.usage(), 'storage', params] as const,
  anomalies: () => [...adminKeys.usage(), 'anomalies'] as const,

  billing: () => [...adminKeys.all, 'billing'] as const,
  billingList: (params: AdminBillingListParams) =>
    [...adminKeys.billing(), 'list', params] as const,
  billingAttention: (windowDays: number | undefined) =>
    [...adminKeys.billing(), 'attention', windowDays ?? 'default'] as const,

  support: () => [...adminKeys.all, 'support'] as const,
  supportList: (params: AdminSupportListParams) =>
    [...adminKeys.support(), 'list', params] as const,
  supportDetail: (id: string) => [...adminKeys.support(), 'detail', id] as const,
};

// --- overview ---------------------------------------------------------

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: fetchAdminOverview,
    staleTime: ADMIN_STALE,
  });
}

export function useAdminSignupsSeries(days: number) {
  return useQuery({
    queryKey: adminKeys.signups(days),
    queryFn: () => fetchAdminSignupsSeries(days),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useAdminRevenueSeries(months: number) {
  return useQuery({
    queryKey: adminKeys.revenue(months),
    queryFn: () => fetchAdminRevenueSeries(months),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

// --- tenants --------------------------------------------------------

export function useAdminTenants(params: AdminTenantListParams) {
  return useQuery({
    queryKey: adminKeys.tenantList(params),
    queryFn: () => fetchAdminTenants(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useAdminTenant(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.tenantDetail(id ?? '__none__'),
    queryFn: () => fetchAdminTenant(id as string),
    enabled: id !== undefined,
    staleTime: ADMIN_STALE,
  });
}

/** Shared success handler for the three tenant mutations that return a detail. */
function useTenantDetailWriteback() {
  const qc = useQueryClient();
  return (detail: AdminTenantDetail) => {
    qc.setQueryData(adminKeys.tenantDetail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: adminKeys.tenants() });
  };
}

export function useDisableTenant() {
  const writeback = useTenantDetailWriteback();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => disableAdminTenant(id, reason),
    onSuccess: writeback,
  });
}

export function useEnableTenant() {
  const writeback = useTenantDetailWriteback();
  return useMutation({
    mutationFn: (id: string) => enableAdminTenant(id),
    onSuccess: writeback,
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdminTenant(id),
    onSuccess: (_res, id) => {
      qc.removeQueries({ queryKey: adminKeys.tenantDetail(id) });
      void qc.invalidateQueries({ queryKey: adminKeys.tenants() });
      void qc.invalidateQueries({ queryKey: adminKeys.overview() });
    },
  });
}

// --- audit log -----------------------------------------------------

export function useAdminAuditLog(params: AdminAuditLogParams) {
  return useQuery({
    queryKey: adminKeys.auditLog(params),
    queryFn: () => fetchAdminAuditLog(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

// --- manual grants -----------------------------------------------

export function useTenantGrants(email: string | undefined) {
  return useQuery({
    queryKey: adminKeys.grants((email ?? '').toLowerCase()),
    queryFn: () => fetchTenantGrants(email as string),
    enabled: !!email,
    staleTime: ADMIN_STALE,
  });
}

/** After any grant write, the tenant's effective tier / history can change —
 *  invalidate grants + tenant views + the overview headline. */
function useGrantInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [...adminKeys.all, 'grants'] });
    void qc.invalidateQueries({ queryKey: adminKeys.tenants() });
    void qc.invalidateQueries({ queryKey: adminKeys.overview() });
    void qc.invalidateQueries({ queryKey: adminKeys.billing() });
  };
}

export function useCreateGrant() {
  const invalidate = useGrantInvalidate();
  return useMutation({
    mutationFn: (input: ManualGrantCreate) => createGrant(input),
    onSuccess: invalidate,
  });
}

export function useUpdateGrant() {
  const invalidate = useGrantInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ManualGrantUpdate }) => updateGrant(id, input),
    onSuccess: invalidate,
  });
}

export function useRevokeGrant() {
  const invalidate = useGrantInvalidate();
  return useMutation({
    mutationFn: (id: string) => revokeGrant(id),
    onSuccess: invalidate,
  });
}

// --- usage ---------------------------------------------------------

export function useAiUsage(params: AdminUsageParams) {
  return useQuery({
    queryKey: adminKeys.aiUsage(params),
    queryFn: () => fetchAiUsage(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useEmailUsage(params: AdminUsageParams) {
  return useQuery({
    queryKey: adminKeys.emailUsage(params),
    queryFn: () => fetchEmailUsage(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useStorageUsage(params: AdminUsageParams) {
  return useQuery({
    queryKey: adminKeys.storageUsage(params),
    queryFn: () => fetchStorageUsage(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useUsageAnomalies() {
  return useQuery({
    queryKey: adminKeys.anomalies(),
    queryFn: fetchUsageAnomalies,
    staleTime: ADMIN_STALE,
  });
}

// --- billing -----------------------------------------------------

export function useBillingSubscriptions(params: AdminBillingListParams) {
  return useQuery({
    queryKey: adminKeys.billingList(params),
    queryFn: () => fetchBillingSubscriptions(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useBillingAttention(renewalWindowDays?: number) {
  return useQuery({
    queryKey: adminKeys.billingAttention(renewalWindowDays),
    queryFn: () => fetchBillingAttention(renewalWindowDays),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

// --- support inbox --------------------------------------------

export function useSupportTickets(params: AdminSupportListParams) {
  return useQuery({
    queryKey: adminKeys.supportList(params),
    queryFn: () => fetchSupportTickets(params),
    staleTime: ADMIN_STALE,
    placeholderData: keepPreviousData,
  });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.supportDetail(id ?? '__none__'),
    queryFn: () => fetchSupportTicket(id as string),
    enabled: id !== undefined,
    staleTime: ADMIN_STALE,
  });
}

function useSupportInvalidate() {
  const qc = useQueryClient();
  return (detail?: { id: string }) => {
    if (detail) qc.setQueryData(adminKeys.supportDetail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: adminKeys.support() });
  };
}

export function useCreateSupportTicket() {
  const invalidate = useSupportInvalidate();
  return useMutation({
    mutationFn: (input: SupportTicketCreate) => createSupportTicket(input),
    onSuccess: (detail) => invalidate(detail),
  });
}

export function useUpdateSupportTicket() {
  const invalidate = useSupportInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupportTicketUpdate }) =>
      updateSupportTicket(id, input),
    onSuccess: (detail) => invalidate(detail),
  });
}

export function useAddSupportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupportMessageCreate }) =>
      addSupportMessage(id, input),
    onSuccess: (detail, { id }) => {
      qc.setQueryData(adminKeys.supportDetail(id), detail);
      void qc.invalidateQueries({ queryKey: adminKeys.support() });
    },
  });
}
