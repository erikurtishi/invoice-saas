import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import {
  getTransition,
  modalContentTransition,
  modalContentVariants,
  modalOverlayTransition,
  modalOverlayVariants,
} from '../../lib/motion-presets';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Controlled only (`open`/`onOpenChange` required) — that's what lets exit
 * animations play: `AnimatePresence` needs the closing content to still be in the
 * React tree for one more frame, which an uncontrolled Radix dialog wouldn't give
 * us. Every call site owns its own `open` state (a `useState` next to the trigger
 * is normal here, same as any controlled form input).
 */
export function Modal({ open, onOpenChange, children }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>{open && children}</AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

export function ModalContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay asChild forceMount>
        <motion.div
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[1px]"
          variants={modalOverlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={getTransition(modalOverlayTransition)}
        />
      </DialogPrimitive.Overlay>

      {/* Flex centering, not translate — leaves `transform` free for Motion's own
          scale/y animation instead of the two fighting over one CSS property. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Content asChild forceMount {...props}>
          <motion.div
            className={cn(
              'relative grid w-full max-w-lg gap-4 rounded-lg border border-border bg-background p-6',
              'shadow-lg',
              className,
            )}
            variants={modalContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={getTransition(modalContentTransition)}
          >
            {children}
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">{t('common.close')}</span>
            </DialogPrimitive.Close>
          </motion.div>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

export function ModalHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
  );
}

export function ModalFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function ModalTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-semibold leading-none', className)}
      {...props}
    />
  );
}

export function ModalDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
