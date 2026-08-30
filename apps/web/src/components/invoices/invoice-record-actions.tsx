import type { InvoiceResponse } from '@invoice-saas/shared';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDeleteInvoice, useDuplicateInvoice } from '../../features/invoices/use-invoices';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';
import { Button, ConfirmDialog } from '../ui';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  edit: 'Edit',
  duplicate: 'Duplicate',
  delete: 'Delete',
  duplicatedToast: 'Duplicated — opened as a new draft.',
  duplicateFailed: "Couldn't duplicate this invoice.",
  deletedToast: 'Invoice deleted.',
  deleteFailed: "Couldn't delete this invoice.",
  deleteTitle: 'Delete this invoice?',
  deleteBody: (n: string) =>
    `${n} will be removed from your library. Its number stays used — invoice numbers are never reused.`,
  deleteConfirm: 'Delete invoice',
} as const;

/**
 * Record-level actions for a saved invoice (backlog 4.4): open in edit mode,
 * duplicate into a new draft, or delete with confirmation. Separate from
 * `<InvoiceActions>` (Download / Send), which act on the document rather than the
 * record.
 */
export function InvoiceRecordActions({ invoice }: { invoice: InvoiceResponse }) {
  const navigate = useNavigate();
  const toast = useToast();
  const duplicate = useDuplicateInvoice();
  const remove = useDeleteInvoice();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runDuplicate = async () => {
    try {
      const copy = await duplicate.mutateAsync(invoice.id);
      toast.success(COPY.duplicatedToast);
      void navigate(`/invoices/${copy.id}/edit`);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.duplicateFailed);
    }
  };

  const runDelete = async () => {
    try {
      await remove.mutateAsync(invoice.id);
      toast.success(COPY.deletedToast);
      void navigate('/invoices');
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.deleteFailed);
      throw err; // keep the confirm dialog open
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void navigate(`/invoices/${invoice.id}/edit`)}
      >
        <Pencil className="size-4" aria-hidden />
        {COPY.edit}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={duplicate.isPending}
        onClick={() => void runDuplicate()}
      >
        <Copy className="size-4" aria-hidden />
        {COPY.duplicate}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        {COPY.delete}
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={COPY.deleteTitle}
        description={COPY.deleteBody(invoice.number ?? invoice.documentType)}
        confirmLabel={COPY.deleteConfirm}
        destructive
        onConfirm={runDelete}
      />
    </div>
  );
}
