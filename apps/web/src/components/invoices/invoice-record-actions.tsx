import type { InvoiceResponse } from '@invoice-saas/shared';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import { useDeleteInvoice, useDuplicateInvoice } from '../../features/invoices/use-invoices';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';
import { Button, ConfirmDialog } from '../ui';

/**
 * Record-level actions for a saved invoice (backlog 4.4): open in edit mode,
 * duplicate into a new draft, or delete with confirmation. Separate from
 * `<InvoiceActions>` (Download / Send), which act on the document rather than the
 * record.
 */
export function InvoiceRecordActions({ invoice }: { invoice: InvoiceResponse }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const duplicate = useDuplicateInvoice();
  const remove = useDeleteInvoice();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runDuplicate = async () => {
    try {
      const copy = await duplicate.mutateAsync(invoice.id);
      toast.success(t('invoices.duplicatedToast'));
      void navigate(`/console/invoices/${copy.id}/edit`);
    } catch (err) {
      toast.error(toUserMessage(err) || t('invoices.duplicateFailed'));
    }
  };

  const runDelete = async () => {
    try {
      await remove.mutateAsync(invoice.id);
      toast.success(t('invoices.deletedToast'));
      void navigate('/console/invoices');
    } catch (err) {
      toast.error(toUserMessage(err) || t('invoices.deleteFailed'));
      throw err; // keep the confirm dialog open
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void navigate(`/console/invoices/${invoice.id}/edit`)}
      >
        <Pencil className="size-4" aria-hidden />
        {t('common.edit')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={duplicate.isPending}
        onClick={() => void runDuplicate()}
      >
        <Copy className="size-4" aria-hidden />
        {t('invoices.duplicate')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        {t('common.delete')}
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('invoices.deleteTitle')}
        description={t('invoices.deleteBody', { name: invoice.number ?? invoice.documentType })}
        confirmLabel={t('invoices.deleteConfirm')}
        destructive
        onConfirm={runDelete}
      />
    </div>
  );
}
