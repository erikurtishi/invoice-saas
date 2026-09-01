import type {
  SupportMessageAuthor,
  SupportTicketDetail,
  SupportTicketStatus,
} from '@invoice-saas/shared';
import { ArrowLeft } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { AdminBadge, AdminSection } from '../../components/admin/admin-ui';
import {
  AUTHOR_LABEL_KEYS,
  PRIORITY_LABEL_KEYS,
  STATUS_LABEL_KEYS,
} from '../../components/admin/support-labels';
import { QueryBoundary } from '../../components/state/query-boundary';
import { Button, Select, Textarea } from '../../components/ui';
import {
  useAddSupportMessage,
  useSupportTicket,
  useUpdateSupportTicket,
} from '../../features/admin/use-admin';
import { useToast } from '../../hooks/use-toast';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { useFormatters } from '../../i18n/format';

const STATUSES: SupportTicketStatus[] = ['OPEN', 'PENDING', 'CLOSED'];
const PRIORITIES: SupportTicketDetail['priority'][] = ['LOW', 'NORMAL', 'HIGH'];

function statusTone(status: SupportTicketStatus): 'info' | 'warning' | 'neutral' {
  switch (status) {
    case 'OPEN':
      return 'info';
    case 'PENDING':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function AdminSupportDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const query = useSupportTicket(id);

  return (
    <div>
      <Link
        to="/admin/support"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('admin.support.backToList')}
      </Link>

      <QueryBoundary
        name="admin-support-detail"
        query={query}
        loading={<div className="h-64 animate-pulse rounded-lg bg-muted" />}
      >
        {(ticket) => <TicketThread ticket={ticket} />}
      </QueryBoundary>
    </div>
  );
}

function TicketThread({ ticket }: { ticket: SupportTicketDetail }) {
  const { t } = useTranslation();
  const { formatDateTime, formatRelativeTime } = useFormatters();
  const toast = useToast();
  const update = useUpdateSupportTicket();
  const addMessage = useAddSupportMessage();

  const [replyAuthor, setReplyAuthor] = useState<SupportMessageAuthor>('ADMIN');
  const [replyBody, setReplyBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);

  const changeStatus = async (status: SupportTicketStatus) => {
    if (status === ticket.status) return;
    try {
      await update.mutateAsync({ id: ticket.id, input: { status } });
      toast.success(
        status === 'CLOSED'
          ? t('admin.support.closedToast')
          : ticket.status === 'CLOSED'
            ? t('admin.support.reopenedToast')
            : t('admin.support.statusUpdatedToast'),
      );
    } catch (err) {
      toast.error(err instanceof HttpError && err.message ? err.message : toUserMessage(err));
    }
  };

  const changePriority = async (priority: SupportTicketDetail['priority']) => {
    if (priority === ticket.priority) return;
    try {
      await update.mutateAsync({ id: ticket.id, input: { priority } });
    } catch (err) {
      toast.error(err instanceof HttpError && err.message ? err.message : toUserMessage(err));
    }
  };

  const submitReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setReplyError(null);
    try {
      await addMessage.mutateAsync({
        id: ticket.id,
        input: { author: replyAuthor, body: replyBody.trim() },
      });
      setReplyBody('');
    } catch (err) {
      setReplyError(err instanceof HttpError && err.message ? err.message : toUserMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ticket.tenantId ? (
                <Link to={`/admin/tenants/${ticket.tenantId}`} className="hover:underline">
                  {ticket.tenantEmail ?? t('common.none')}
                </Link>
              ) : ticket.tenantEmail ? (
                <span title={t('admin.support.noMatchingAccount')}>
                  {ticket.tenantEmail} · {t('admin.support.noMatchingAccount')}
                </span>
              ) : (
                t('admin.support.tenantUnknown')
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t('admin.support.priority')}
              className="w-32"
              value={ticket.priority}
              onValueChange={(v) => void changePriority(v as SupportTicketDetail['priority'])}
              options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL_KEYS[p]) }))}
            />
            <Select
              aria-label={t('admin.support.status')}
              className="w-36"
              value={ticket.status}
              onValueChange={(v) => void changeStatus(v as SupportTicketStatus)}
              options={STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL_KEYS[s]) }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <AdminBadge tone={statusTone(ticket.status)}>
            {t(STATUS_LABEL_KEYS[ticket.status])}
          </AdminBadge>
          <span>{t('admin.support.opened', { time: formatDateTime(ticket.createdAt) })}</span>
          {ticket.closedAt && (
            <span>{t('admin.support.closed', { time: formatDateTime(ticket.closedAt) })}</span>
          )}
        </div>
      </header>

      <AdminSection title={t('admin.support.threadTitle')}>
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.support.noMessages')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ticket.messages.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <AdminBadge tone={m.author === 'ADMIN' ? 'info' : 'neutral'}>
                    {t(AUTHOR_LABEL_KEYS[m.author])}
                  </AdminBadge>
                  <time className="text-xs text-muted-foreground" dateTime={m.createdAt}>
                    {formatRelativeTime(m.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={(e) => void submitReply(e)} className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{t('admin.support.reply')}</span>
            <Select
              aria-label={t('admin.support.replyAs')}
              className="w-40"
              value={replyAuthor}
              onValueChange={(v) => setReplyAuthor(v as SupportMessageAuthor)}
              options={[
                { value: 'ADMIN', label: t(AUTHOR_LABEL_KEYS.ADMIN) },
                { value: 'TENANT', label: t('admin.support.logTenantSaid') },
              ]}
            />
          </div>
          <Textarea
            rows={3}
            maxLength={10_000}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={t('admin.support.replyPlaceholder')}
          />
          {replyError && (
            <p className="text-sm text-destructive" role="alert">
              {replyError}
            </p>
          )}
          <div>
            <Button
              type="submit"
              size="sm"
              isLoading={addMessage.isPending}
              disabled={!replyBody.trim()}
            >
              {t('admin.support.send')}
            </Button>
          </div>
        </form>
      </AdminSection>
    </div>
  );
}
