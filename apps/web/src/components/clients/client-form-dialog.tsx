import type { ClientResponse } from '@invoice-saas/shared';
import { useTranslation } from 'react-i18next';

import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '../ui';
import { ClientForm } from './client-form';

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
  const { t } = useTranslation();
  const isEdit = client !== undefined;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <ModalHeader>
          <ModalTitle>
            {isEdit ? t('clients.dialogEditTitle') : t('clients.dialogCreateTitle')}
          </ModalTitle>
          <ModalDescription>
            {isEdit ? t('clients.dialogEditDescription') : t('clients.dialogCreateDescription')}
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
