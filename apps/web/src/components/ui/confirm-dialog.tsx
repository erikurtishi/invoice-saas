import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from './button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from './modal';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for a destructive action (delete). */
  destructive?: boolean;
  /**
   * Runs on confirm. If it returns a promise the confirm button shows its loading
   * state until it settles, and the dialog closes only on success — a rejection
   * leaves the dialog open so the caller can surface the error (e.g. a toast).
   */
  onConfirm: () => void | Promise<unknown>;
}

/**
 * The shared "are you sure?" modal — used wherever an action needs a deliberate
 * second step (client delete 2.1.4, and every later destructive action). Built on
 * the `Modal` primitive so it inherits the same overlay, focus trap and exit
 * animation as every other dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const handleConfirm = () => {
    const result = onConfirm();
    if (!(result instanceof Promise)) {
      onOpenChange(false);
      return;
    }
    setPending(true);
    result
      .then(() => onOpenChange(false))
      .catch(() => undefined)
      .finally(() => setPending(false));
  };

  return (
    <Modal open={open} onOpenChange={pending ? () => undefined : onOpenChange}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          {description != null && <ModalDescription>{description}</ModalDescription>}
        </ModalHeader>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            isLoading={pending}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
