import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { cn } from '../../lib/cn';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none ' +
    'disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-transparent hover:bg-muted',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9 shrink-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render as the single child element instead of a `<button>` (e.g. a Link). */
  asChild?: boolean;
  /**
   * Loading state (task 0.4b.8): the control is disabled, `aria-busy` is set, and a
   * spinner is overlaid **on top of the label** while the label stays in place but
   * invisible — so the button keeps its exact width and never reflows mid-action.
   * Standard for every async action (save, send, generate).
   */
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, isLoading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled ?? isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {/* Slot (asChild) requires exactly one child element — the spinner can only
            be spliced in when we're rendering a real <button>. */}
        {asChild ? (
          children
        ) : (
          <>
            {isLoading && (
              <span
                className="absolute inset-0 inline-flex items-center justify-center"
                aria-hidden="true"
              >
                <Loader2 className="size-4 animate-spin" />
              </span>
            )}
            {/* Kept mounted (just hidden) so the button's width doesn't change. */}
            <span className={cn('inline-flex items-center gap-2', isLoading && 'invisible')}>
              {children}
            </span>
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
