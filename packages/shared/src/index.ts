/**
 * @invoice-saas/shared — the single source of truth for data shapes used by both
 * apps/web and apps/api (see CLAUDE.md).
 *
 * Zod schemas live here and are imported by the API for request validation and by
 * the web app for React Hook Form resolvers, so a shape can never drift between
 * the two. Domain schemas arrive with their phases (Tenant/User in Phase 1,
 * Client/Product in Phase 2, Template in Phase 3, Invoice in Phase 4); this file
 * is the barrel that re-exports them.
 */

export const SHARED_PACKAGE_NAME = '@invoice-saas/shared' as const;

export * from './api-error.js';
export * from './auth.js';
export * from './billing.js';
export * from './client.js';
export * from './invoice.js';
export * from './invoice-history.js';
export * from './money.js';
export * from './product.js';
export * from './profile.js';
export * from './render/index.js';
export * from './template.js';
export * from './text.js';
