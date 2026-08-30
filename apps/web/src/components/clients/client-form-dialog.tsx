import type { ClientResponse } from '@invoice-saas/shared';

import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '../ui';
import { ClientForm } from './client-form';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  createTitle: 'Add a client',
  createDescription: 'Save a customer once and reuse them on any invoice.',
  editTitle: 'Edit client',
  editDescription:
    'Changes apply to new invoices — invoices already created keep their saved details.',
} as const;

export interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit; absent → create. */
  client?: ClientResponse | undefined;
  /** Fired after a successful save with the saved client — the dialog closes
   * itself; a caller (e.g. the Phase 4 invoice form) uses this to select the new
   * client immediately. */
  onSaved?: ((client: ClientResponse) => void) | undefined;
}

/**
 * The client create/edit form in a modal (backlog 2.1.5 — "add new client from
 * within the invoice form, no navigation away"). The client list uses it for both
 * "New client" and row-edit; the Phase 4 invoice form reuses it verbatim.
 */
export function ClientFormDialog({ open, onOpenChange, client, onSaved }: ClientFormDialogProps) {
  const isEdit = client !== undefined;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <ModalHeader>
          <ModalTitle>{isEdit ? COPY.editTitle : COPY.createTitle}</ModalTitle>
          <ModalDescription>
            {isEdit ? COPY.editDescription : COPY.createDescription}
          </ModalDescription>
        </ModalHeader>
        <ClientForm
          client={client}
          layout="dialog"
          onCancel={() => onOpenChange(false)}
          onSaved={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }}
        />
      </ModalContent>
    </Modal>
  );
}
