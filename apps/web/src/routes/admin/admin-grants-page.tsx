import type { ManualGrant, TenantGrants } from '@invoice-saas/shared';
import { Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { AdminBadge, AdminPageHeader, AdminSection } from '../../components/admin/admin-ui';
import { GrantEditDialog } from '../../components/admin/grant-edit-dialog';
import { GrantForm } from '../../components/admin/grant-form';
import { QueryBoundary } from '../../components/state/query-boundary';
import {
  Button,
  ConfirmDialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { useRevokeGrant, useTenantGrants } from '../../features/admin/use-admin';
import { HttpError } from '../../lib/http-error';
import { useToast } from '../../hooks/use-toast';
import { useFormatters } from '../../i18n/format';

/**
 * Manual subscription grant form + view (backlog Epic L2.4, closes `6.3.2`).
 * `/admin/grants` — look a tenant up by email (prefilled from `?email=` when
 * reached from the tenant detail page), then issue / extend / revoke grants.
 * Every write is audit-logged by the backend and shows read-only in the tenant's
 * `subscriptionHistory`. Respects `D5` (highest live access wins; every row kept).
 */

function statusTone(status: ManualGrant['status']): 'success' | 'neutral' | 'danger' | 'warning' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'CANCELED':
      return 'danger';
    case 'PAST_DUE':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function AdminGrantsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const email = (searchParams.get('email') ?? '').trim();

  const lookup = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = new FormData(e.currentTarget).get('email');
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) setSearchParams({ email: value });
    else setSearchParams({});
  };

  return (
    <div>
      <AdminPageHeader
        title={t('admin.grants.title')}
        description={t('admin.grants.description')}
      />

      <form onSubmit={lookup} className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="grant-email" className="mb-1 block text-sm font-medium text-foreground">
            {t('admin.grants.lookupLabel')}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="grant-email"
              key={email}
              name="email"
              type="email"
              className="pl-9"
              defaultValue={email}
              placeholder={t('admin.grants.lookupPlaceholder')}
            />
          </div>
        </div>
        <Button type="submit" variant="outline">
          {t('admin.grants.lookupButton')}
        </Button>
      </form>

      {email === '' ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('admin.grants.enterEmail')}
        </p>
      ) : (
        <GrantsForEmail email={email} />
      )}
    </div>
  );
}

function GrantsForEmail({ email }: { email: string }) {
  const { t } = useTranslation();
  const query = useTenantGrants(email);

  return (
    <QueryBoundary
      name="admin-grants"
      query={query}
      loading={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
      error={({ error, retry }) =>
        error instanceof HttpError && error.status === 404 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('admin.grants.noAccount', { email })}
          </p>
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">{t('states.inlineErrorTitle')}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        )
      }
    >
      {(data) => <GrantsPanel data={data} />}
    </QueryBoundary>
  );
}

function GrantsPanel({ data }: { data: TenantGrants }) {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const toast = useToast();
  const revoke = useRevokeGrant();

  const [editing, setEditing] = useState<ManualGrant | null>(null);
  const [revoking, setRevoking] = useState<ManualGrant | null>(null);

  const { tenant, grants } = data;

  const confirmRevoke = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success(t('admin.grants.revokedToast'));
      setRevoking(null);
    } catch (err) {
      toast.error(
        err instanceof HttpError && err.message ? err.message : t('admin.grants.actionFailed'),
      );
      throw err;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{tenant.businessName}</p>
          <p className="truncate text-xs text-muted-foreground">{tenant.email}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('admin.grants.effectiveTier')}</span>
          <AdminBadge
            tone={
              tenant.tier === 'PREMIUM' ? 'success' : tenant.tier === 'BASIC' ? 'info' : 'neutral'
            }
          >
            {tenant.tier}
          </AdminBadge>
        </div>
      </div>

      <AdminSection title={t('admin.grants.issueTitle')} description={t('admin.grants.d5Note')}>
        <GrantForm
          email={tenant.email}
          onIssued={() => toast.success(t('admin.grants.issuedToast'))}
        />
      </AdminSection>

      <AdminSection title={t('admin.grants.historyTitle')}>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.grants.noGrants')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.grants.colTier')}</TableHead>
                  <TableHead>{t('admin.grants.colStatus')}</TableHead>
                  <TableHead>{t('admin.grants.colStart')}</TableHead>
                  <TableHead>{t('admin.grants.colEnd')}</TableHead>
                  <TableHead>{t('admin.grants.colDaysLeft')}</TableHead>
                  <TableHead>{t('admin.grants.colNote')}</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{g.tier}</TableCell>
                    <TableCell>
                      <AdminBadge tone={statusTone(g.status)}>{g.status}</AdminBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(g.startDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(g.endDate)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {g.daysRemaining}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                      {g.note ?? t('common.none')}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {(g.status === 'ACTIVE' || g.status === 'EXPIRED') && (
                          <Button variant="ghost" size="sm" onClick={() => setEditing(g)}>
                            {t('admin.grants.extend')}
                          </Button>
                        )}
                        {g.status === 'ACTIVE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setRevoking(g)}
                          >
                            {t('admin.grants.revoke')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminSection>

      {editing && (
        <GrantEditDialog
          grant={editing}
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => {
            toast.success(t('admin.grants.updatedToast'));
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('admin.grants.revokeTitle')}
        description={revoking ? t('admin.grants.revokeBody', { tier: revoking.tier }) : undefined}
        confirmLabel={t('admin.grants.revoke')}
        destructive
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
