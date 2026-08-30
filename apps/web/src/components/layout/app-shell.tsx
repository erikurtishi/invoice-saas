import type { ReactNode } from 'react';

import { MobileNav } from './mobile-nav';
import { Sidebar } from './sidebar';

/**
 * The shell every route renders inside (backlog 0.4.3): sidebar on desktop, a
 * top bar + drawer below `lg`, and a max-width container so content never
 * stretches edge-to-edge on wide/ultrawide screens (X.2.5).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
