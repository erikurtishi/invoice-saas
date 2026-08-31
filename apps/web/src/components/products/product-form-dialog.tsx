import type { ProductResponse } from '@invoice-saas/shared';
import { useTranslation } from 'react-i18next';

import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '../ui';
import { ProductForm } from './product-form';

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
  const { t } = useTranslation();
  const isEdit = product !== undefined;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <ModalHeader>
          <ModalTitle>
            {isEdit ? t('products.dialogEditTitle') : t('products.dialogCreateTitle')}
          </ModalTitle>
          <ModalDescription>
            {isEdit ? t('products.dialogEditDescription') : t('products.dialogCreateDescription')}
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
