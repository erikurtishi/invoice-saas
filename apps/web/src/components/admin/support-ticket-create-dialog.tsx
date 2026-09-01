import { SUPPORT_TICKET_PRIORITIES } from '@invoice-saas/shared';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateSupportTicket } from '../../features/admin/use-admin';
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
  Select,
  Textarea,
} from '../ui';
import { PRIORITY_LABEL_KEYS } from './support-labels';

/**
 * "Open a case" dialog (backlog `L2.7.1`). `POST /admin/support/tickets` — the
 * tenant link is best-effort: an email that matches no account still opens a
 * ticket (`tenantId` null, `tenantEmail` kept as the only handle).
 */
export function SupportTicketCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: string) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateSupportTicket();

  const [tenantEmail, setTenantEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<(typeof SUPPORT_TICKET_PRIORITIES)[number]>('NORMAL');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTenantEmail('');
    setSubject('');
    setPriority('NORMAL');
    setBody('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const ticket = await create.mutateAsync({
        tenantEmail: tenantEmail.trim(),
        subject: subject.trim(),
        priority,
        body: body.trim(),
      });
      reset();
      onCreated(ticket.id);
    } catch (err) {
      setError(err instanceof HttpError && err.message ? err.message : toUserMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) {
          if (!next) reset();
          onOpenChange(next);
        }
      }}
    >
      <ModalContent className="max-w-md">
        <form onSubmit={(e) => void submit(e)}>
          <ModalHeader>
            <ModalTitle>{t('admin.support.newTitle')}</ModalTitle>
            <ModalDescription>{t('admin.support.newBody')}</ModalDescription>
          </ModalHeader>

          <div className="mt-2 flex flex-col gap-4">
            <FormField label={t('admin.support.tenantEmail')}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  type="email"
                  required
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  placeholder="owner@example.com"
                />
              )}
            </FormField>

            <FormField label={t('admin.support.subject')}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  required
                  maxLength={200}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              )}
            </FormField>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {t('admin.support.priority')}
              </span>
              <Select
                aria-label={t('admin.support.priority')}
                value={priority}
                onValueChange={(v) => setPriority(v as (typeof SUPPORT_TICKET_PRIORITIES)[number])}
                options={SUPPORT_TICKET_PRIORITIES.map((p) => ({
                  value: p,
                  label: t(PRIORITY_LABEL_KEYS[p]),
                }))}
              />
            </div>

            <FormField label={t('admin.support.openingMessage')}>
              {({ controlProps }) => (
                <Textarea
                  {...controlProps}
                  required
                  rows={4}
                  maxLength={10_000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
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
              disabled={create.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={create.isPending}>
              {t('admin.support.openTicket')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
