import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { getTransition } from '../../lib/motion-presets';
import { NAV_ITEMS } from './nav-items';

const DRAWER_TRANSITION = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };
const OVERLAY_TRANSITION = { duration: 0.15 };

/**
 * Phone/tablet only (below `lg`): a top bar with a menu button opening a full-height
 * slide-in drawer — the mobile counterpart to `Sidebar` (backlog 0.4.3 offers
 * "bottom nav OR drawer"; a drawer fits six nav items without crowding a bottom bar
 * below the 44px touch-target minimum).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        {/* TODO(X.1.1): hardcoded placeholder copy, see decision D9. */}
        <span className="text-sm font-semibold">Invoice SaaS</span>
        <DialogPrimitive.Trigger
          className={cn(
            'flex size-9 items-center justify-center rounded-md text-muted-foreground',
            'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring',
          )}
          aria-label="Open navigation"
        >
          <Menu className="size-5" aria-hidden="true" />
        </DialogPrimitive.Trigger>
      </header>

      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-foreground/40 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={getTransition(OVERLAY_TRANSITION)}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className={cn(
                  'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r',
                  'border-border bg-card lg:hidden',
                )}
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={getTransition(DRAWER_TRANSITION)}
              >
                <div className="flex h-14 items-center justify-between border-b border-border px-4">
                  <DialogPrimitive.Title className="text-sm font-semibold">
                    Menu
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    className={cn(
                      'flex size-9 items-center justify-center rounded-md text-muted-foreground',
                      'hover:bg-muted hover:text-foreground focus-visible:outline-none',
                      'focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                    aria-label="Close navigation"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </DialogPrimitive.Close>
                </div>
                <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary">
                  {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </nav>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
