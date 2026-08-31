import { motion } from 'motion/react';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';
import { switchThumbSpring } from '../../lib/motion-presets';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/**
 * A minimal toggle — `<button role="switch">`, no dependency. Used for the
 * template editor's block-visibility toggles (3.2.3) and anywhere a boolean needs
 * a switch rather than a checkbox.
 *
 * X.3.2 micro-interaction: the button dips on press (`whileTap`) and the knob
 * springs between positions (`switchThumbSpring`); both flatten to an instant
 * change for `prefers-reduced-motion` users via the app-wide `MotionConfig`.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, id, disabled = false, className, ...aria }, ref) => (
    <motion.button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      {...(disabled ? {} : { whileTap: { scale: 0.94 } })}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className,
      )}
      {...aria}
    >
      <motion.span
        className="size-3.5 rounded-full bg-background shadow-sm"
        animate={{ x: checked ? 16 : 0 }}
        transition={switchThumbSpring}
      />
    </motion.button>
  ),
);
Switch.displayName = 'Switch';
