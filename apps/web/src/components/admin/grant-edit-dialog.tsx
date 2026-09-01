import type { ManualGrant } from '@invoice-saas/shared';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUpdateGrant } from '../../features/admin/use-admin';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { FormField } from '../form/field';
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

/**
 * Extend / shorten / re-note one manual grant (backlog `L2.4.1`). `PATCH
 * /admin/grants/:id` takes any subset of `{ startDate, endDate, note }`; this
 * always sends all three (prefilled from the grant), which is a no-op diff for
 * unchanged fields and lets the server audit only what actually moved.
 */
export function GrantEditDialog({
  grant,
  open,
  onOpenChange,
  onSaved,
}: {
  grant: ManualGrant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateGrant();

  const [startDate, setStartDate] = useState(grant.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(grant.endDate.slice(0, 10));
  const [note, setNote] = useState(grant.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const dateOrderInvalid = endDate < startDate;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (dateOrderInvalid) return;
    try {
      await update.mutateAsync({
        id: grant.id,
        input: { startDate, endDate, note: note.trim() ? note.trim() : null },
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof HttpError && err.message ? err.message : toUserMessage(err));
    }
  };

  return (
    <Modal open={open} onOpenChange={update.isPending ? () => undefined : onOpenChange}>
      <ModalContent className="max-w-md">
        <form onSubmit={(e) => void submit(e)}>
          <ModalHeader>
            <ModalTitle>{t('admin.grants.editTitle')}</ModalTitle>
            <ModalDescription>{t('admin.grants.editBody', { tier: grant.tier })}</ModalDescription>
          </ModalHeader>

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.grants.startDate')}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label={t('admin.grants.endDate')}
              error={dateOrderInvalid ? t('admin.grants.endBeforeStart') : undefined}
            >
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              )}
            </FormField>
          </div>

          <div className="mt-4">
            <FormField label={t('admin.grants.note')}>
              {({ controlProps }) => (
                <Textarea
                  {...controlProps}
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </FormField>
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
              disabled={update.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={update.isPending} disabled={dateOrderInvalid}>
              {t('common.saveChanges')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
