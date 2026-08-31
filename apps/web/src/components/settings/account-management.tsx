import { deleteAccountSchema, type DeleteAccountInput } from '@invoice-saas/shared';
import { Download, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useExportMyData, useDeleteAccount } from '../../features/account/use-account';
import { useToast } from '../../hooks/use-toast';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';
import { FormField } from '../form/field';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '../ui';

/**
 * Settings → data export (X.4.5) + account deletion (X.4.4). Export streams a
 * JSON download; deletion is gated behind a modal that re-collects the email and
 * password, then logs the user out to `/login?deleted=1`.
 */
export function AccountManagement() {
  return (
    <div className="flex flex-col gap-6">
      <DataExportCard />
      <DangerZoneCard />
    </div>
  );
}

function DataExportCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const exportData = useExportMyData();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.dataTitle')}</CardTitle>
        <CardDescription>{t('settings.dataDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          isLoading={exportData.isPending}
          onClick={() =>
            exportData.mutate(undefined, {
              onError: (err) => toast.error(toUserMessage(err) || t('settings.exportError')),
            })
          }
        >
          <Download className="size-4" aria-hidden />
          {t('settings.exportButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

function DangerZoneCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">{t('settings.dangerTitle')}</CardTitle>
        <CardDescription>{t('settings.dangerDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <TriangleAlert className="size-4" aria-hidden />
          {t('settings.deleteButton')}
        </Button>
      </CardContent>
      <DeleteAccountModal open={open} onOpenChange={setOpen} />
    </Card>
  );
}

function DeleteAccountModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();
  const form = useZodForm<DeleteAccountInput>(deleteAccountSchema);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await deleteAccount.mutateAsync(values);
      void navigate('/login?deleted=1', { replace: true });
    } catch (err) {
      if (!applyFieldErrors<DeleteAccountInput>(err, form.setError)) {
        setFormError(toUserMessage(err) || t('settings.deleteError'));
      }
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (deleteAccount.isPending) return;
        if (!next) {
          form.reset();
          setFormError(null);
        }
        onOpenChange(next);
      }}
    >
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>{t('settings.deleteDialogTitle')}</ModalTitle>
          <ModalDescription>{t('settings.deleteDialogBody')}</ModalDescription>
        </ModalHeader>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
            >
              {formError}
            </p>
          )}

          <FormField
            label={t('settings.confirmEmailLabel')}
            required
            error={form.formState.errors.confirmEmail?.message}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('confirmEmail')}
                type="email"
                autoComplete="off"
                invalid={invalid}
              />
            )}
          </FormField>

          <FormField
            label={t('settings.confirmPasswordLabel')}
            required
            error={form.formState.errors.password?.message}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                {...form.register('password')}
                type="password"
                autoComplete="current-password"
                invalid={invalid}
              />
            )}
          </FormField>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteAccount.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" isLoading={deleteAccount.isPending}>
              {t('settings.deleteConfirm')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
