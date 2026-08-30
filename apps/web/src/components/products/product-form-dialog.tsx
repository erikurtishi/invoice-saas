import type { ProductResponse } from '@invoice-saas/shared';

import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '../ui';
import { ProductForm } from './product-form';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  createTitle: 'Add a product',
  createDescription: 'Save a product or service once and reuse it as an invoice line.',
  editTitle: 'Edit product',
  editDescription:
    'Changes apply to new invoice lines — lines already added to an invoice keep their values.',
} as const;

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit; absent → create. */
  product?: ProductResponse | undefined;
  /** Fired after a successful save — the dialog closes itself; the Phase 4 invoice
   * form uses this to insert the new product as a line immediately (2.2.4). */
  onSaved?: ((product: ProductResponse) => void) | undefined;
}

/**
 * The product create/edit form in a modal (backlog 2.2.4 — "inline add from the
 * invoice form"). The product list uses it for "New product" and row-edit; Phase
 * 4's line-item editor reuses it verbatim.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: ProductFormDialogProps) {
  const isEdit = product !== undefined;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <ModalHeader>
          <ModalTitle>{isEdit ? COPY.editTitle : COPY.createTitle}</ModalTitle>
          <ModalDescription>
            {isEdit ? COPY.editDescription : COPY.createDescription}
          </ModalDescription>
        </ModalHeader>
        <ProductForm
          product={product}
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
