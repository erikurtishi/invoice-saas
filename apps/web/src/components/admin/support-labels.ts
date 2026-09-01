/**
 * Typed `enum → i18n key` maps for the support inbox (backlog `L2.7.1`). Kept as
 * `as const` records (not a template-literal `t()` call) so `t()` still resolves
 * a real key from the resource union instead of a widened `string`.
 */

export const STATUS_LABEL_KEYS = {
  OPEN: 'admin.support.statusOpen',
  PENDING: 'admin.support.statusPending',
  CLOSED: 'admin.support.statusClosed',
} as const;

export const PRIORITY_LABEL_KEYS = {
  LOW: 'admin.support.priorityLow',
  NORMAL: 'admin.support.priorityNormal',
  HIGH: 'admin.support.priorityHigh',
} as const;

export const AUTHOR_LABEL_KEYS = {
  ADMIN: 'admin.support.authorAdmin',
  TENANT: 'admin.support.authorTenant',
} as const;
