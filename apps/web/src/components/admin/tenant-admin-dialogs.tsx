import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminTenantDetail } from '@invoice-saas/shared';

import { useDeleteTenant, useDisableTenant, useEnableTenant } from '../../features/admin/use-admin';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Textarea,
} from '../ui';

/** The server's own message is user-appropriate for the admin guards
 *  ("Admin accounts cannot be disabled or deleted here.", "…your own account.")
 *  — prefer it over the generic 4xx fallback. */
function adminActionMessage(err: unknown): string {
  return err instanceof HttpError && err.message ? err.message : toUserMessage(err);
}

/**
 * Disable / re-enable one tenant (backlog `L2.3.3`). Disable takes an optional
 * free-text reason; re-enable is a plain confirm. Both hit
 * `POST /admin/tenants/:id/{disable,enable}`, which revokes the tenant's sessions
 * on disable and refuses an `ADMIN` target or the caller's own account.
 */
export function TenantDisableDialog({
  tenant,
  open,
  onOpenChange,
  onDone,
}: {
  tenant: AdminTenantDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTranslation();
  const disabling = tenant.disabledAt === null;
  const disable = useDisableTenant();
  const enable = useEnableTenant();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = disable.isPending || enable.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (disabling) {
        await disable.mutateAsync({
          id: tenant.id,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
        onDone(t('admin.tenants.disabledToast', { email: tenant.email }));
      } else {
        await enable.mutateAsync(tenant.id);
        onDone(t('admin.tenants.enabledToast', { email: tenant.email }));
      }
      setReason('');
      onOpenChange(false);
    } catch (err) {
      setError(adminActionMessage(err));
    }
  };

  return (
    <Modal open={open} onOpenChange={pending ? () => undefined : onOpenChange}>
      <ModalContent className="max-w-md">
        <form onSubmit={(e) => void submit(e)}>
          <ModalHeader>
            <ModalTitle>
              {disabling ? t('admin.tenants.disableTitle') : t('admin.tenants.enableTitle')}
            </ModalTitle>
            <ModalDescription>
              {disabling
                ? t('admin.tenants.disableBody', { email: tenant.email })
                : t('admin.tenants.enableBody', { email: tenant.email })}
            </ModalDescription>
          </ModalHeader>

          {disabling && (
            <div className="mt-2">
              <label
                htmlFor="disable-reason"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                {t('admin.tenants.reasonLabel')}{' '}
                <span className="text-muted-foreground">({t('common.optionalInline')})</span>
              </label>
              <Textarea
                id="disable-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('admin.tenants.reasonPlaceholder')}
                maxLength={500}
              />
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={disabling ? 'destructive' : 'primary'}
              isLoading={pending}
            >
              {disabling ? t('admin.tenants.disableConfirm') : t('admin.tenants.enableConfirm')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

/**
 * Hard-delete one tenant and every row it owns (backlog `L2.3.4`). Type-to-confirm
 * on the tenant's email; the body lists the cascade. `DELETE /admin/tenants/:id`
 * writes the `tenant.delete` audit row with `deletedCounts` and applies the same
 * `ADMIN`/self guard as disable.
 */
export function TenantDeleteDialog({
  tenant,
  open,
  onOpenChange,
  onDeleted,
}: {
  tenant: AdminTenantDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (message: string) => void;
}) {
  const { t } = useTranslation();
  const del = useDeleteTenant();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim().toLowerCase() === tenant.email.toLowerCase();

  const cascade = [
    t('admin.tenants.cascadeClients'),
    t('admin.tenants.cascadeProducts'),
    t('admin.tenants.cascadeTemplates'),
    t('admin.tenants.cascadeInvoices'),
    t('admin.tenants.cascadeHistory'),
    t('admin.tenants.cascadeSubscriptions'),
    t('admin.tenants.cascadeUsage'),
    t('admin.tenants.cascadeTokens'),
    t('admin.tenants.cascadeLogo'),
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    setError(null);
    try {
      await del.mutateAsync(tenant.id);
      onDeleted(t('admin.tenants.deletedToast', { email: tenant.email }));
    } catch (err) {
      setError(adminActionMessage(err));
    }
  };

  return (
    <Modal open={open} onOpenChange={del.isPending ? () => undefined : onOpenChange}>
      <ModalContent className="max-w-md">
        <form onSubmit={(e) => void submit(e)}>
          <ModalHeader>
            <ModalTitle>{t('admin.tenants.deleteTitle')}</ModalTitle>
            <ModalDescription>
              {t('admin.tenants.deleteBody', { name: tenant.businessName })}
            </ModalDescription>
          </ModalHeader>

          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {cascade.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>

          <div className="mt-4">
            <label
              htmlFor="delete-confirm"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              {t('admin.tenants.deleteTypeToConfirm', { email: tenant.email })}
            </label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={del.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!confirmed}
              isLoading={del.isPending}
            >
              {t('admin.tenants.deleteConfirm')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
